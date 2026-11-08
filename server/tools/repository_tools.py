from  uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from services.search.hybrid_search import hybrid_search


async def search_repository(
        db:AsyncSession,
        repo_id:UUID,
        branch:str,
        query:str,
        limit: int = 10,

):
    results = await hybrid_search(
        db=db,
        repo_id=repo_id,
        branch=branch,
        query=query,
        limit=limit,
    )
    return [
        {
            "path": item["chunk"].path,
            "name": item["chunk"].name,
            "start_line": item["chunk"].start_line,
            "end_line": item["chunk"].end_line,
            "content": item["chunk"].content,
            "score": item["score"],
        }
        for item in results
    ]