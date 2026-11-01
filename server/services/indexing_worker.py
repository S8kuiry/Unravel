
import asyncio
import logging
import uuid

from datetime import datetime, timedelta, timezone

from sqlalchemy import (
    select,
    update,
    delete,
    func,
    exists,
    and_,
)
from sqlalchemy.orm import aliased

from db.database import AsyncSessionLocal
from models.github import (
    RepoFile,
    RepoBlob,
    RepoChunk,
    RepoIndexJob,
)
from ingestion.chunker import chunk_file_content
from services.embedding_service import embed_code_chunk


logger = logging.getLogger(__name__)

LEASE_MINUTES = 10
HEARTBEAT_SECONDS = 180
MAX_RETRY_DELAY_SECONDS = 1800
BATCH_SIZE = 5

def utc_now():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------
# 1. CLAIM ONE JOB
# ---------------------------------------------------------

async def claim_index_jobs():
    worker_id = str(uuid.uuid4())
    now = utc_now()

    async with AsyncSessionLocal() as db:
        async with db.begin():

            # # Recover jobs whose worker lease expired.
            # await db.execute(
            #     update(RepoIndexJob)
            #     .where(
            #         RepoIndexJob.status == "processing",
            #         RepoIndexJob.lease_expires_at <= now,
            #     )
            #     .values(
            #         status=func.coalesce(
            #             None,
            #             RepoIndexJob.status,
            #         ),
            #     )
            # )

            # Explicitly move expired jobs to pending or failed.
            expired = await db.execute(
                select(RepoIndexJob).where(
                    RepoIndexJob.status == "processing",
                    RepoIndexJob.lease_expires_at <= now,
                ).with_for_update(skip_locked=True)
            )

            for job in expired.scalars().all():
                if job.attempts >= job.max_attempts:
                    job.status = "failed"
                else:
                    job.status = "pending"

                job.locked_by = None
                job.lease_expires_at = None

            # Prevent two workers from claiming jobs for the
            # same branch-specific file at the same time.
            ActiveJob = aliased(RepoIndexJob)

            active_job_exists = exists(
                select(1).where(
                    ActiveJob.repo_id == RepoIndexJob.repo_id,
                    ActiveJob.branch == RepoIndexJob.branch,
                    ActiveJob.path == RepoIndexJob.path,
                    ActiveJob.status == "processing",
                    ActiveJob.lease_expires_at > now,
                )
            )

            result = await db.execute(
                select(RepoIndexJob)
                .join(
                    RepoFile,
                    and_(
                        RepoFile.repo_id == RepoIndexJob.repo_id,
                        RepoFile.branch == RepoIndexJob.branch,
                        RepoFile.path == RepoIndexJob.path,
                    ),
                )
                .where(
                    RepoIndexJob.status == "pending",
                    RepoIndexJob.available_at <= now,
                    RepoIndexJob.attempts < RepoIndexJob.max_attempts,
                    ~active_job_exists,
                )
                .order_by(
                    RepoIndexJob.available_at,
                    RepoIndexJob.created_at,
                )
                .limit(BATCH_SIZE)
                .with_for_update(
                    of=(RepoIndexJob, RepoFile),
                    skip_locked=True,
                )
            )

            job = result.scalar_one_or_none()

            if not job:
                return worker_id, []

            job.status = "processing"
            job.attempts += 1
            job.locked_by = worker_id
            job.lease_expires_at = (
                now + timedelta(minutes=LEASE_MINUTES)
            )
            job.last_error = None

            return worker_id, [job.id]


# ---------------------------------------------------------
# 2. HEARTBEAT
# ---------------------------------------------------------

async def heartbeat_index_job(job_id, worker_id, lost_event):
    while True:
        await asyncio.sleep(HEARTBEAT_SECONDS)

        now = utc_now()

        try:
            async with AsyncSessionLocal() as db:
                async with db.begin():
                    result = await db.execute(
                        update(RepoIndexJob)
                        .where(
                            RepoIndexJob.id == job_id,
                            RepoIndexJob.status == "processing",
                            RepoIndexJob.locked_by == worker_id,
                            RepoIndexJob.lease_expires_at > now,
                        )
                        .values(
                            lease_expires_at=(
                                now + timedelta(minutes=LEASE_MINUTES)
                            )
                        )
                    )

                    if result.rowcount != 1:
                        lost_event.set()
                        return

        except Exception:
            logger.exception("Heartbeat failed for job %s", job_id)
            lost_event.set()
            return


# ---------------------------------------------------------
# 3. RETRY / FAILURE
# ---------------------------------------------------------

async def mark_job_failed(job_id, worker_id, error):
    async with AsyncSessionLocal() as db:
        async with db.begin():
            result = await db.execute(
                select(RepoIndexJob)
                .where(
                    RepoIndexJob.id == job_id,
                    RepoIndexJob.status == "processing",
                    RepoIndexJob.locked_by == worker_id,
                )
                .with_for_update()
            )

            job = result.scalar_one_or_none()

            if not job:
                return

            if job.attempts >= job.max_attempts:
                job.status = "failed"
            else:
                delay = min(
                    30 * (2 ** (job.attempts - 1)),
                    MAX_RETRY_DELAY_SECONDS,
                )

                job.status = "pending"
                job.available_at = (
                    utc_now() + timedelta(seconds=delay)
                )

            job.last_error = str(error)[:4000]
            job.locked_by = None
            job.lease_expires_at = None


async def mark_job_skipped(job_id, worker_id, reason):
    async with AsyncSessionLocal() as db:
        async with db.begin():
            await db.execute(
                update(RepoIndexJob)
                .where(
                    RepoIndexJob.id == job_id,
                    RepoIndexJob.status == "processing",
                    RepoIndexJob.locked_by == worker_id,
                )
                .values(
                    status="skipped",
                    last_error=reason,
                    locked_by=None,
                    lease_expires_at=None,
                )
            )


# ---------------------------------------------------------
# 4. LOAD AND VERIFY FILE CONTENT BEFORE CHUNKING
# ---------------------------------------------------------

async def load_indexing_content(job_id, worker_id):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(
                RepoIndexJob,
                RepoFile,
                RepoBlob,
            )
            .join(
                RepoFile,
                and_(
                    RepoFile.repo_id == RepoIndexJob.repo_id,
                    RepoFile.branch == RepoIndexJob.branch,
                    RepoFile.path == RepoIndexJob.path,
                ),
            )
            .join(
                RepoBlob,
                and_(
                    RepoBlob.repo_id == RepoIndexJob.repo_id,
                    RepoBlob.path == RepoIndexJob.path,
                ),
            )
            .where(
                RepoIndexJob.id == job_id,
                RepoIndexJob.status == "processing",
                RepoIndexJob.locked_by == worker_id,
            )
        )

        row = result.one_or_none()

        if not row:
            return None

        job, file, blob = row

        # Verify both SHAs before doing any chunking or embedding.
        if file.sha != job.blob_sha:
            return None

        if blob.sha != job.blob_sha:
            return None

        if blob.is_binary or blob.content is None:
            return None

        return {
            "repo_id": job.repo_id,
            "branch": job.branch,
            "path": job.path,
            "blob_sha": job.blob_sha,
            "content": blob.content,
        }


# ---------------------------------------------------------
# 5. PREPARE OR REUSE CHUNKS
# ---------------------------------------------------------

async def prepare_repo_chunks(
    job_id,
    worker_id,
    file_data,
    chunks,
):
    repo_id = file_data["repo_id"]
    branch = file_data["branch"]
    path = file_data["path"]
    blob_sha = file_data["blob_sha"]

    async with AsyncSessionLocal() as db:
        async with db.begin():

            job_result = await db.execute(
                select(RepoIndexJob)
                .where(
                    RepoIndexJob.id == job_id,
                    RepoIndexJob.status == "processing",
                    RepoIndexJob.locked_by == worker_id,
                    RepoIndexJob.lease_expires_at > utc_now(),
                )
                .with_for_update()
            )

            job = job_result.scalar_one_or_none()

            if not job:
                return False

            # Lock and recheck the current file and cached blob.
            file_result = await db.execute(
                select(RepoFile)
                .where(
                    RepoFile.repo_id == repo_id,
                    RepoFile.branch == branch,
                    RepoFile.path == path,
                )
                .with_for_update()
            )

            file = file_result.scalar_one_or_none()

            blob_result = await db.execute(
                select(RepoBlob)
                .where(
                    RepoBlob.repo_id == repo_id,
                    RepoBlob.path == path,
                )
                .with_for_update()
            )

            blob = blob_result.scalar_one_or_none()

            if (
                not file
                or not blob
                or file.sha != blob_sha
                or blob.sha != blob_sha
                or blob.is_binary
                or blob.content is None
            ):
                return False

            existing_result = await db.execute(
                select(RepoChunk)
                .where(
                    RepoChunk.repo_id == repo_id,
                    RepoChunk.branch == branch,
                    RepoChunk.path == path,
                )
                .order_by(RepoChunk.chunk_index)
                .with_for_update()
            )

            existing = existing_result.scalars().all()

            # Reuse chunks and embeddings only when every
            # piece of chunk metadata still matches.
            reusable = len(existing) == len(chunks)

            if reusable:
                for old, new in zip(existing, chunks):
                    if (
                        old.blob_sha != blob_sha
                        or old.chunk_index != new["chunk_index"]
                        or old.name != new.get("name")
                        or old.content != new["content"]
                        or old.start_line != new["start_line"]
                        or old.end_line != new["end_line"]
                    ):
                        reusable = False
                        break

            if reusable:
                return True

            # Option A: replace old chunks with the new version.
            # This intentionally removes old searchable chunks
            # while the new version is being embedded.
            await db.execute(
                delete(RepoChunk).where(
                    RepoChunk.repo_id == repo_id,
                    RepoChunk.branch == branch,
                    RepoChunk.path == path,
                )
            )

            for chunk in chunks:
                db.add(
                    RepoChunk(
                        repo_id=repo_id,
                        branch=branch,
                        path=path,
                        chunk_index=chunk["chunk_index"],
                        name=chunk.get("name"),
                        blob_sha=blob_sha,
                        content=chunk["content"],
                        start_line=chunk["start_line"],
                        end_line=chunk["end_line"],
                        embedding=None,
                    )
                )

    return True


# ---------------------------------------------------------
# 6. SAVE EACH EMBEDDING IMMEDIATELY
# ---------------------------------------------------------

async def save_chunk_embedding(
    job_id,
    worker_id,
    repo_id,
    branch,
    path,
    blob_sha,
    chunk_index,
    embedding,
):
    async with AsyncSessionLocal() as db:
        async with db.begin():

            job_result = await db.execute(
                select(RepoIndexJob)
                .where(
                    RepoIndexJob.id == job_id,
                    RepoIndexJob.status == "processing",
                    RepoIndexJob.locked_by == worker_id,
                    RepoIndexJob.lease_expires_at > utc_now(),
                )
                .with_for_update()
            )

            if not job_result.scalar_one_or_none():
                return False

            result = await db.execute(
                update(RepoChunk)
                .where(
                    RepoChunk.repo_id == repo_id,
                    RepoChunk.branch == branch,
                    RepoChunk.path == path,
                    RepoChunk.chunk_index == chunk_index,
                    RepoChunk.blob_sha == blob_sha,
                    RepoChunk.embedding.is_(None),
                )
                .values(embedding=embedding)
            )

            if result.rowcount == 1:
                return True

            # Another attempt may already have saved this embedding.
            existing = await db.execute(
                select(RepoChunk.embedding).where(
                    RepoChunk.repo_id == repo_id,
                    RepoChunk.branch == branch,
                    RepoChunk.path == path,
                    RepoChunk.chunk_index == chunk_index,
                    RepoChunk.blob_sha == blob_sha,
                )
            )

            return existing.scalar_one_or_none() is not None


# ---------------------------------------------------------
# 7. EMBED ONLY CHUNKS THAT ARE STILL PENDING
# ---------------------------------------------------------

async def embed_pending_chunks(
    job_id,
    worker_id,
    file_data,
    lost_event,
):
    repo_id = file_data["repo_id"]
    branch = file_data["branch"]
    path = file_data["path"]
    blob_sha = file_data["blob_sha"]

    while not lost_event.is_set():

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(RepoChunk)
                .where(
                    RepoChunk.repo_id == repo_id,
                    RepoChunk.branch == branch,
                    RepoChunk.path == path,
                    RepoChunk.blob_sha == blob_sha,
                    RepoChunk.embedding.is_(None),
                )
                .order_by(RepoChunk.chunk_index)
                .limit(1)
            )

            chunk = result.scalar_one_or_none()

            if not chunk:
                return True

            chunk_index = chunk.chunk_index
            content = chunk.content
            title = chunk.name or path

        if lost_event.is_set():
            return False

        # The API call happens outside the database transaction.
        embedding = await embed_code_chunk(
            content=content,
            title=title,
        )

        if lost_event.is_set():
            return False

        saved = await save_chunk_embedding(
            job_id=job_id,
            worker_id=worker_id,
            repo_id=repo_id,
            branch=branch,
            path=path,
            blob_sha=blob_sha,
            chunk_index=chunk_index,
            embedding=embedding,
        )

        if not saved:
            return False

    return False


# ---------------------------------------------------------
# 8. FINAL VERIFICATION AND COMPLETION
# ---------------------------------------------------------

async def finalize_index_job(
    job_id,
    worker_id,
    file_data,
):
    repo_id = file_data["repo_id"]
    branch = file_data["branch"]
    path = file_data["path"]
    blob_sha = file_data["blob_sha"]

    async with AsyncSessionLocal() as db:
        async with db.begin():

            job_result = await db.execute(
                select(RepoIndexJob)
                .where(
                    RepoIndexJob.id == job_id,
                    RepoIndexJob.status == "processing",
                    RepoIndexJob.locked_by == worker_id,
                    RepoIndexJob.lease_expires_at > utc_now(),
                )
                .with_for_update()
            )

            job = job_result.scalar_one_or_none()

            if not job:
                return False

            file_result = await db.execute(
                select(RepoFile.sha)
                .where(
                    RepoFile.repo_id == repo_id,
                    RepoFile.branch == branch,
                    RepoFile.path == path,
                )
                .with_for_update()
            )

            current_file_sha = file_result.scalar_one_or_none()

            blob_result = await db.execute(
                select(RepoBlob.sha)
                .where(
                    RepoBlob.repo_id == repo_id,
                    RepoBlob.path == path,
                )
                .with_for_update()
            )

            current_blob_sha = blob_result.scalar_one_or_none()

            if (
                current_file_sha != blob_sha
                or current_blob_sha != blob_sha
            ):
                return False

            total_result = await db.execute(
                select(func.count())
                .select_from(RepoChunk)
                .where(
                    RepoChunk.repo_id == repo_id,
                    RepoChunk.branch == branch,
                    RepoChunk.path == path,
                    RepoChunk.blob_sha == blob_sha,
                )
            )

            total = total_result.scalar_one()

            pending_result = await db.execute(
                select(func.count())
                .select_from(RepoChunk)
                .where(
                    RepoChunk.repo_id == repo_id,
                    RepoChunk.branch == branch,
                    RepoChunk.path == path,
                    RepoChunk.blob_sha == blob_sha,
                    RepoChunk.embedding.is_(None),
                )
            )

            pending = pending_result.scalar_one()

            if pending != 0:
                return False

            # A zero-chunk file is valid too.
            job.status = "completed"
            job.completed_at = utc_now()
            job.locked_by = None
            job.lease_expires_at = None
            job.last_error = None

            logger.info(
                "Indexed %s (%s chunks)",
                path,
                total,
            )

            return True


# ---------------------------------------------------------
# 9. PROCESS ONE JOB
# ---------------------------------------------------------

async def process_index_job(job_id, worker_id):
    lost_event = asyncio.Event()

    heartbeat_task = asyncio.create_task(
        heartbeat_index_job(
            job_id,
            worker_id,
            lost_event,
        )
    )

    try:
        file_data = await load_indexing_content(
            job_id,
            worker_id,
        )

        if not file_data:
            await mark_job_skipped(
                job_id,
                worker_id,
                "File or cached blob is missing, binary, or SHA does not match.",
            )
            return False

        if lost_event.is_set():
            return False

        # Chunk only after the initial SHA/content checks.
        chunks = chunk_file_content(
            file_data["path"],
            file_data["content"],
        )

        chunks = [
            chunk for chunk in chunks
            if chunk["content"].strip()
        ]

        if lost_event.is_set():
            return False

        prepared = await prepare_repo_chunks(
            job_id,
            worker_id,
            file_data,
            chunks,
        )

        if not prepared:
            return False

        if lost_event.is_set():
            return False

        embedded = await embed_pending_chunks(
            job_id,
            worker_id,
            file_data,
            lost_event,
        )

        if not embedded or lost_event.is_set():
            return False

        return await finalize_index_job(
            job_id,
            worker_id,
            file_data,
        )

    except Exception as exc:
        logger.exception("Indexing job %s failed", job_id)

        if not lost_event.is_set():
            await mark_job_failed(
                job_id,
                worker_id,
                exc,
            )

        return False

    finally:
        heartbeat_task.cancel()

        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass


# ---------------------------------------------------------
# 10. PROCESS ONE BATCH (ONE JOB PER WORKER CALL)
# ---------------------------------------------------------

async def process_index_batch():
    worker_id, job_ids = await claim_index_jobs()

    if not job_ids:
        return {
            "claimed": 0,
            "completed": 0,
        }

    results = await asyncio.gather(
        *[
            process_index_job(worker_id, job_id)
            for job_id in job_ids
        ],
        return_exceptions=True,
    )

    completed = sum(result is True for result in results)

    return {
        "claimed": len(job_ids),
        "completed": completed,
    }