
import logging
import time
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.github import RepoChunk

logger = logging.getLogger(__name__)


async def keyword_search(
    db: AsyncSession,
    repo_id,
    branch: str,
    query: str,
    limit: int = 10,
    rrf_k: int = 60,
):
    query = query.strip()

    if not query:
        return []

    # ---------------------------------
    # 1. Full-text search
    # ---------------------------------

    search_query = func.websearch_to_tsquery(
        "english",
        query,
    )

    rank = func.ts_rank(
        RepoChunk.search_vector,
        search_query,
    ).label("rank")

    full_text_statement = (
        select(RepoChunk, rank)
        .where(
            RepoChunk.repo_id == repo_id,
            RepoChunk.branch == branch,
            RepoChunk.search_vector.op("@@")(search_query),
        )
        .order_by(rank.desc())
        .limit(limit)
    )

    full_text_start = time.perf_counter()
    full_text_result = await db.execute(full_text_statement)
    full_text_rows = full_text_result.all()
    full_text_elapsed = time.perf_counter() - full_text_start
    logger.info(
        "KEYWORD_SEARCH full_text_query took %.3fs | rows_returned=%d",
        full_text_elapsed,
        len(full_text_rows),
    )

    full_text_results = [
        {"chunk": chunk, "score": float(score)}
        for chunk, score in full_text_rows
    ]

    # ---------------------------------
    # 2. Trigram search
    # ---------------------------------

    similarity = func.similarity(
        RepoChunk.name,
        query,
    ).label("similarity")

    trigram_statement = (
        select(RepoChunk, similarity)
        .where(
            RepoChunk.repo_id == repo_id,
            RepoChunk.branch == branch,
            RepoChunk.name.is_not(None),
            RepoChunk.name.op("%")(query),
        )
        .order_by(similarity.desc())
        .limit(limit)
    )

    trigram_start = time.perf_counter()
    trigram_result = await db.execute(trigram_statement)
    trigram_rows = trigram_result.all()
    trigram_elapsed = time.perf_counter() - trigram_start
    logger.info(
        "KEYWORD_SEARCH trigram_query took %.3fs | rows_returned=%d",
        trigram_elapsed,
        len(trigram_rows),
    )

    trigram_results = [
        {"chunk": chunk, "score": float(score)}
        for chunk, score in trigram_rows
    ]

    # ---------------------------------
    # 3. Merge using RRF
    # ---------------------------------

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

    add_results(full_text_results)
    add_results(trigram_results)

    ranked_results = sorted(
        fused.values(),
        key=lambda item: item["score"],
        reverse=True,
    )

    return ranked_results[:limit]
