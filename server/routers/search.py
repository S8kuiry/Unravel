
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from models.github import Repository
from models.search import SearchRequest, SearchResponse, SearchResult
from services.search.hybrid_search import hybrid_search

from security.auth import get_current_uid


router = APIRouter()


@router.post("/search", response_model=SearchResponse)
async def search_repository(
    request: SearchRequest,
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    # 1. Verify repository ownership
    statement = select(Repository).where(
        Repository.id == request.repo_id,
        Repository.user_uid == uid,
    )

    result = await db.execute(statement)
    repository = result.scalar_one_or_none()

    if repository is None:
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        )

    chunks = await hybrid_search(
    db=db,
    repo_id=repository.id,
    branch=request.branch,
    query=request.query,
    limit=request.limit,
)

    # 3. Convert chunks into API response
    results = [
        SearchResult(
            path=item["chunk"].path,
            name=item["chunk"].name,
            start_line=item["chunk"].start_line,
            end_line=item["chunk"].end_line,
            content=item["chunk"].content,
            score=item["score"],
        )
        for item in chunks
    ]

    return SearchResponse(
        results=results,
        total=len(results),
    )
