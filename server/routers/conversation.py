
from fastapi import APIRouter, Depends, HTTPException, Query
from server.models.github import Repository
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_
from db.database import get_db
from security.auth import get_current_uid
import uuid
import logging
from models.conversation import ConversationCreateRequest
from crud.conversation import create_conversation

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/conversations", tags=["conversations"])

@router.post("/")
async def  create_new_conversation(
    request: ConversationCreateRequest,
    uid : str = Depends(get_current_uid),
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

    # 2. Create conversation
    conversation = await create_conversation(
        db=db,
        repo_id=repository.id,
        title=request.title,
    )

    logger.info(
        "CONVERSATION created | conversation_id=%s repo_id=%s uid=%s",
        conversation.id,
        repository.id,
        uid,
    )

    return conversation

