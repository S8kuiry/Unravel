
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.github import RepoChunk
from services.embedding_service import embed_search_query


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
    query_embedding = await embed_search_query(query)

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

    result = await db.execute(statement)

    return [
        {
            "chunk": chunk,
            "score": float(1 - distance_value),
        }
        for chunk, distance_value in result.all()
    ]
