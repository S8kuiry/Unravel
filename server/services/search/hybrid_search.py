import asyncio
import logging
import time
from sqlalchemy.ext.asyncio import AsyncSession
from services.search.keyword_search import keyword_search
from services.search.vector_search import vector_search

logger = logging.getLogger(__name__)


async def hybrid_search(
    db: AsyncSession,
    repo_id,
    branch: str,
    query: str,
    limit: int = 10,
    rrf_k: int = 60,
):
    # Over-fetch candidates (e.g., 3x limit) to give RRF a richer pool to rank
    fetch_limit = limit * 2

    # Run searches sequentially to prevent SQLAlchemy AsyncSession concurrency conflicts
    keyword_start = time.perf_counter()
    keyword_results = await keyword_search(
        db=db,
        repo_id=repo_id,
        branch=branch,
        query=query,
        limit=fetch_limit,
    )
    keyword_elapsed = time.perf_counter() - keyword_start
    logger.info(
        "HYBRID_SEARCH keyword_search took %.3fs | results=%d",
        keyword_elapsed,
        len(keyword_results),
    )
    
    vector_start = time.perf_counter()
    vector_results = await vector_search(
        db=db,
        repo_id=repo_id,
        branch=branch,
        query=query,
        limit=fetch_limit,
    )
    vector_elapsed = time.perf_counter() - vector_start
    logger.info(
        "HYBRID_SEARCH vector_search took %.3fs | results=%d",
        vector_elapsed,
        len(vector_results),
    )

    fused = {}

    def add_results(results):
        for rank, item in enumerate(results, start=1):
            chunk = item["chunk"]

            key = (
                chunk.repo_id,
                chunk.branch,
                chunk.path,
                chunk.chunk_index,
            )

            if key not in fused:
                fused[key] = {
                    "chunk": chunk,
                    "score": 0.0,
                }

            fused[key]["score"] += 1 / (rrf_k + rank)

    add_results(keyword_results)
    add_results(vector_results)

    ranked_results = sorted(
        fused.values(),
        key=lambda item: item["score"],
        reverse=True,
    )

    return ranked_results[:limit]