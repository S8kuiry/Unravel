
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.github import RepoChunk


async def keyword_search(
    db: AsyncSession,
    repo_id,
    branch: str,
    query: str,
    limit: int = 10,
):
    query = query.strip()

    if not query:
        return []

    search_query = func.websearch_to_tsquery(
        "english",
        query,
    )

    rank = func.ts_rank(
        RepoChunk.search_vector,
        search_query,
    ).label("rank")

    statement = (
        select(RepoChunk, rank)
        .where(
            RepoChunk.repo_id == repo_id,
            RepoChunk.branch == branch,
            RepoChunk.search_vector.op("@@")(search_query),
        )
        .order_by(rank.desc())
        .limit(limit)
    )

    result = await db.execute(statement)

    return [
        {
            "chunk": chunk,
            "score": float(score),
        }
        for chunk, score in result.all()
    ]
