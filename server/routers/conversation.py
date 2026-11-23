import asyncio
import json
import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from crud.conversation import (
    create_conversation,
    create_message,
    delete_conversation,
    get_conversation_by_id,
    get_repository_conversations,
    make_unique_title,
    rename_conversation,
)
from db.database import get_db
from models.conversation import (
    ConversationCreateRequest,
    ConversationDetailResponse,
    ConversationListResponse,
    ConversationRenameRequest,
    ConversationResponse,
    ConversationTitleRequest,
    MessageCreateRequest,
)
from models.github import Repository
from security.auth import get_current_uid
from services.agent.groq_client import generate_title
from crud.conversation import (
    _get_owned_conversation,
    _stream_agent_sse,
    _build_recent_context
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/conversations", tags=["conversations"])


# create conversation
@router.post("/", response_model=ConversationResponse)
async def create_new_conversation(
    request: ConversationCreateRequest,
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


# -- get conversations for a repository
@router.get("/repository/{repo_id}",response_model=ConversationListResponse)
async def  get_conversations(
    repo_id : UUID,
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),

):
     # 1. Verify repository ownership
    statement = select(Repository).where(
        Repository.id == repo_id,
        Repository.user_uid == uid,
    )

    result = await db.execute(statement)
    repository = result.scalar_one_or_none()

    if repository is None:
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        )

    # 2. Fetch conversations
    conversations = await get_repository_conversations(
        db=db,
        repo_id=repository.id,
    )

    # 3. Return response
    return ConversationListResponse(
        conversations=conversations,
        total=len(conversations),
    )



# get repository conversation messages by id
@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    conversation_id: UUID,
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    conversation = await get_conversation_by_id(
        db=db,
        conversation_id=conversation_id,
    )

    if conversation is None:
        raise HTTPException(404, "Conversation not found")

    # Verify ownership through its repository
    statement = select(Repository).where(
        Repository.id == conversation.repo_id,
        Repository.user_uid == uid,
    )

    result = await db.execute(statement)

    if result.scalar_one_or_none() is None:
        raise HTTPException(404, "Conversation not found")

    return conversation



#converstion rename 
@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation_title(
    conversation_id: UUID,
    request: ConversationRenameRequest,
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    conversation = await get_conversation_by_id(
        db=db,
        conversation_id=conversation_id,
    )

    if conversation is None:
        raise HTTPException(404, "Conversation not found")

    statement = select(Repository).where(
        Repository.id == conversation.repo_id,
        Repository.user_uid == uid,
    )

    result = await db.execute(statement)

    if result.scalar_one_or_none() is None:
        raise HTTPException(404, "Conversation not found")

    return await rename_conversation(
        db=db,
        conversation=conversation,
        title=request.title,
    )



@router.post("/{conversation_id}/messages")
async def send_user_message(
    conversation_id: UUID,
    request: MessageCreateRequest,
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    conversation = await _get_owned_conversation(
        db=db,
        conversation_id=conversation_id,
        uid=uid,
    )
    context = await _build_recent_context(
        db=db,
        conversation_id=conversation_id,
    )
    user_message = await create_message(
        db=db,
        conversation=conversation,
        content=request.content,
        role="user",
    )

    return StreamingResponse(
        _stream_agent_sse(
            db=db,
            conversation=conversation,
            request=request,
            context=context,
            user_message_id=user_message.id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

# generate an AI title from the first user message
@router.post("/{conversation_id}/title", response_model=ConversationResponse)
async def generate_conversation_title(
    conversation_id: UUID,
    request: ConversationTitleRequest,
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    conversation = await get_conversation_by_id(
        db=db,
        conversation_id=conversation_id,
    )

    if conversation is None:
        raise HTTPException(404, "Conversation not found")

    statement = select(Repository).where(
        Repository.id == conversation.repo_id,
        Repository.user_uid == uid,
    )
    result = await db.execute(statement)

    if result.scalar_one_or_none() is None:
        raise HTTPException(404, "Conversation not found")

    # Guard: only replace an empty title or the frontend placeholder
    # (the placeholder is a truncated prefix of the first message).
    # A manual rename never matches, so it is never overwritten.
    normalized = " ".join(request.content.split())
    current = (conversation.title or "").rstrip("…").strip()
    if current and not normalized.startswith(current):
        return conversation

    new_title = await generate_title(request.content)

    if not new_title:
        return conversation  # keep the fallback title

    # Dedupe in the DB (no AI involved)
    unique_title = await make_unique_title(
        db=db,
        repo_id=conversation.repo_id,
        title=new_title,
        exclude_id=conversation.id,
    )

    return await rename_conversation(
        db=db,
        conversation=conversation,
        title=unique_title,
    )



#conversation delete
@router.delete("/{conversation_id}")
async def remove_conversation(
    conversation_id: UUID,
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    conversation = await get_conversation_by_id(
        db=db,
        conversation_id=conversation_id,
    )

    if conversation is None:
        raise HTTPException(404, "Conversation not found")

    statement = select(Repository).where(
        Repository.id == conversation.repo_id,
        Repository.user_uid == uid,
    )

    result = await db.execute(statement)

    if result.scalar_one_or_none() is None:
        raise HTTPException(404, "Conversation not found")

    await delete_conversation(
        db=db,
        conversation=conversation,
    )

    return {"detail": "Conversation deleted successfully"}