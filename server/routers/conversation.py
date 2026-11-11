from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from models.github import Repository
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_
from db.database import get_db
from security.auth import get_current_uid
import logging
from models.conversation import (
    ConversationCreateRequest,
    ConversationResponse,
    ConversationListResponse,
    ConversationDetailResponse,
    ConversationRenameRequest,
    ConversationTitleRequest,
    MessageCreateRequest,
    MessageResponse,
)
from crud.conversation import (
    create_conversation,
    get_repository_conversations,
    get_conversation_by_id,
    make_unique_title,
    rename_conversation,
    delete_conversation,
    create_message,
)
from services.agent.agent import run_agent
from services.agent.groq_client import generate_title
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


# create  a message in a conversation
@router.post(
    "/{conversation_id}/messages",
    response_model=MessageResponse,
)
async def send_user_message(
    conversation_id: UUID,
    request: MessageCreateRequest,
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

    # 1. Save the user's message
    await create_message(
        db=db,
        conversation=conversation,
        content=request.content,
        role="user",
    )

    # 2. Generate the agent's response
    answer = await run_agent(
        message=request.content,
        db=db,
        repo_id=conversation.repo_id,
        branch=request.branch,
        context=request.context,
    )

    # 3. Save the agent's response
    agent_message = await create_message(
        db=db,
        conversation=conversation,
        content=answer,
        role="agent",
    )

    # 4. Return the agent's response
    return agent_message



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

