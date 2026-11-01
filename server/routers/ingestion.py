from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from ingestion.chunker import chunk_file_content
from db.database import get_db
from security.auth import get_current_uid
import uuid
from pydantic import BaseModel

from uuid import UUID
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_
from models.github import Repository, RepoFile, RepoIndexJob
from services.repository_progress import repository_index_progress_stream


router = APIRouter(
    prefix="/ingestion",
    tags=["Ingestion"],
)

# 1. Define the expected request body schema using Pydantic
class FileChunkRequest(BaseModel):
    path: str
    content: str
    max_lines: int = 80
    max_chars: int = 12000

@router.post('/chunks')
async def chunker(payload: FileChunkRequest):
    try:
        # 2. Pass the fields directly from the validated payload into your function
        chunks = chunk_file_content(
            path=payload.path,
            content=payload.content,
            max_lines=payload.max_lines,
            max_chars=payload.max_chars,
        )
        return {"success": True, "total_chunks": len(chunks), "chunks": chunks}

    except ValueError as e:
        # Use 400 Bad Request for invalid parameters instead of 401 (Unauthorized)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        # Fallback for unexpected errors
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred: {str(e)}",
        )


# sse endpoint



@router.get("/repositories/{repo_id}/index-progress")
async def repository_index_progress(
    repo_id: UUID,
    request: Request,
    branch: str = Query(default="main"),
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):

    # Verify repository ownership.
    result = await db.execute(
        select(Repository.id).where(
            Repository.id == repo_id,
            Repository.user_uid == uid,
        )
    )

    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    # Delegate SSE generation to the service.
    return StreamingResponse(
        repository_index_progress_stream(
            repo_id=repo_id,
            branch=branch,
            request=request,
            db=db,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )