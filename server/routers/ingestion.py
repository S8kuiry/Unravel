from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from ingestion.chunker import chunk_file_content
from db.database import get_db
from security.auth import get_current_uid
import uuid
from pydantic import BaseModel


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


