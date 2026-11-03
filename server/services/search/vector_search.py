
import logging
import time
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from models.github import RepoChunk
from services.embedding_service import embed_search_query

logger = logging.getLogger(__name__)


async def vector_search(
    db: AsyncSession,
    repo_id,
    branch: str,
    query: str,
    limit: int = 10,
):
    query = query.strip()

    if not query:
        return []

    # Generate one embedding for the user's query.
    embed_start = time.perf_counter()
    query_embedding = await embed_search_query(query)
    embed_elapsed = time.perf_counter() - embed_start
    logger.info(
        "VECTOR_SEARCH embed_query took %.3fs | query=%r", embed_elapsed, query
    )

    # Cosine distance: lower distance means greater similarity.
    distance = RepoChunk.embedding.cosine_distance(
        query_embedding
    ).label("distance")

    statement = (
        select(RepoChunk, distance)
        .where(
            RepoChunk.repo_id == repo_id,
            RepoChunk.branch == branch,
            RepoChunk.embedding.is_not(None),
        )
        .order_by(distance.asc())
        .limit(limit)
    )

    db_start = time.perf_counter()
    
    result = await db.execute(statement)
    rows = result.all()
    db_elapsed = time.perf_counter() - db_start
    logger.info(
        "VECTOR_SEARCH db_query took %.3fs | rows_returned=%d",
        db_elapsed,
        len(rows),
    )

    return [
        {
            "chunk": chunk,
            "score": float(1 - distance_value),
        }
        for chunk, distance_value in rows
    ]
