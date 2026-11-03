
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.github import RepoChunk


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

    full_text_result = await db.execute(full_text_statement)

    full_text_results = [
        {"chunk": chunk, "score": float(score)}
        for chunk, score in full_text_result.all()
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

    trigram_result = await db.execute(trigram_statement)

    trigram_results = [
        {"chunk": chunk, "score": float(score)}
        for chunk, score in trigram_result.all()
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
