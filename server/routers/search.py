import logging
import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from models.github import Repository
from models.search import SearchRequest, SearchResponse, SearchResult
from services.search.hybrid_search import hybrid_search

from security.auth import get_current_uid

logger = logging.getLogger(__name__)


router = APIRouter()


@router.post("/search", response_model=SearchResponse)
async def search_repository(
    request: SearchRequest,
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    endpoint_start = time.perf_counter()
    logger.info(
        "SEARCH endpoint hit | repo_id=%s uid=%s branch=%s query=%r limit=%s",
        request.repo_id,
        uid,
        request.branch,
        request.query,
        request.limit,
    )

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

    search_start = time.perf_counter()
    chunks = await hybrid_search(
        db=db,
        repo_id=repository.id,
        branch=request.branch,
        query=request.query,
        limit=request.limit,
    )
    search_elapsed = time.perf_counter() - search_start
    logger.info(
        "HYBRID_SEARCH completed in %.3fs | repo_id=%s results=%d",
        search_elapsed,
        repository.id,
        len(chunks),
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

    endpoint_total = time.perf_counter() - endpoint_start
    logger.info(
        "SEARCH endpoint completed | repo_id=%s total_time=%.3fs results_returned=%d",
        request.repo_id,
        endpoint_total,
        len(results),
    )

    return SearchResponse(
        results=results,
        total=len(results),
    )
