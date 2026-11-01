
import asyncio

from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import Request

from models.github import RepoFile, RepoIndexJob
from utils.sse import sse_event  # Adjust to your actual sse_event location


async def repository_index_progress_stream(
    repo_id: UUID,
    branch: str,
    request: Request,
    db: AsyncSession,
):
    previous_states = None

    while not await request.is_disconnected():

        # End the previous read transaction.
        await db.rollback()

        # 1. Fetch files and their matching current-SHA jobs.
        result = await db.execute(
            select(
                RepoFile.path,
                RepoIndexJob.status,
            )
            .outerjoin(
                RepoIndexJob,
                and_(
                    RepoIndexJob.repo_id == RepoFile.repo_id,
                    RepoIndexJob.branch == RepoFile.branch,
                    RepoIndexJob.path == RepoFile.path,
                    RepoIndexJob.blob_sha == RepoFile.sha,
                ),
            )
            .where(
                RepoFile.repo_id == repo_id,
                RepoFile.branch == branch,
            )
        )

        rows = result.all()

        total_files = len(rows)

        states = {
            path: job_status or "pending"
            for path, job_status in rows
        }

        # 2. Calculate progress.
        indexed_files = sum(
            1 for state in states.values()
            if state == "completed"
        )

        processing_files = sum(
            1 for state in states.values()
            if state == "processing"
        )

        failed_files = sum(
            1 for state in states.values()
            if state == "failed"
        )

        skipped_files = sum(
            1 for state in states.values()
            if state == "skipped"
        )

        pending_files = sum(
            1 for state in states.values()
            if state == "pending"
        )

        progress = (
            round(indexed_files / total_files * 100, 2)
            if total_files > 0
            else 0
        )

        finished = (
            pending_files == 0
            and processing_files == 0
        )

        # 3. Send overall progress.
        yield sse_event(
            "progress",
            {
                "repo_id": str(repo_id),
                "branch": branch,
                "total_files": total_files,
                "indexed_files": indexed_files,
                "processing_files": processing_files,
                "pending_files": pending_files,
                "failed_files": failed_files,
                "skipped_files": skipped_files,
                "progress": progress,
                "finished": finished,
            },
        )

        # 4. Send file-level events.
        if previous_states is not None:

            for path, current_status in states.items():

                old_status = previous_states.get(path)

                if old_status == current_status:
                    continue

                event_data = {
                    "path": path,
                    "status": current_status,
                    "indexed_files": indexed_files,
                    "total_files": total_files,
                    "progress": progress,
                }

                if current_status == "processing":
                    yield sse_event("job_started", event_data)

                elif current_status == "completed":
                    yield sse_event("job_completed", event_data)

                elif current_status == "failed":
                    yield sse_event("job_failed", event_data)

                elif current_status == "skipped":
                    yield sse_event("job_skipped", event_data)

        else:
            # Initial connection: show currently processing files.
            for path, current_status in states.items():

                if current_status == "processing":
                    yield sse_event(
                        "job_started",
                        {
                            "path": path,
                            "status": current_status,
                        },
                    )

        previous_states = states

        # 5. Stop when all files reach terminal states.
        if finished:

            if total_files > 0 and indexed_files == total_files:

                yield sse_event(
                    "indexing_completed",
                    {
                        "total_files": total_files,
                        "indexed_files": indexed_files,
                        "progress": 100,
                    },
                )

            else:

                yield sse_event(
                    "indexing_finished",
                    {
                        "total_files": total_files,
                        "indexed_files": indexed_files,
                        "failed_files": failed_files,
                        "skipped_files": skipped_files,
                        "progress": progress,
                    },
                )

            break

        # 6. Keep connection alive and poll again.
        yield ": keepalive\n\n"

        await asyncio.sleep(2)
