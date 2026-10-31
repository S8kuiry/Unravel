
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from models.github import RepoFile, RepoBlob, RepoIndexJob


async def enqueue_fetched_files_for_indexing(
    db: AsyncSession,
    repo_id,
    branch: str,
):
    """
    Create indexing jobs for fetched, non-binary files
    whose cached content matches the current branch SHA.
    """

    # 1. Find files whose content has been fetched
    eligible_files = (
        select(
            RepoFile.repo_id,
            RepoFile.branch,
            RepoFile.path,
            RepoFile.sha,
        )
        .join(
            RepoBlob,
            and_(
                RepoBlob.repo_id == RepoFile.repo_id,
                RepoBlob.path == RepoFile.path,
            ),
        )
        .where(
            RepoFile.repo_id == repo_id,
            RepoFile.branch == branch,

            # Content must actually exist
            RepoBlob.content.is_not(None),

            # Ignore binary files
            RepoBlob.is_binary.is_(False),

            # Cached content must match this branch's file version
            RepoBlob.sha == RepoFile.sha,
        )
    )

    # 2. Insert indexing jobs
    # ON CONFLICT prevents duplicate jobs for the same file version
    stmt = (
        pg_insert(RepoIndexJob)
        .from_select(
            ["repo_id", "branch", "path", "blob_sha"],
            eligible_files,
        )
        .on_conflict_do_nothing(
            constraint="uq_repo_index_job_file_version"
        )
        .returning(RepoIndexJob.id)
    )

    result = await db.execute(stmt)

    created_job_ids = result.scalars().all()

    return {
        "created": len(created_job_ids),
    }
