from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from models.github import Repository
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sql_delete , or_
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
    MessageResponse,Message
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

MAX_CONTEXT_MESSAGES = 6

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


# send message 
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
    # 1. Get conversation
    conversation = await get_conversation_by_id(
        db=db,
        conversation_id=conversation_id,
    )

    if conversation is None:
        raise HTTPException(404, "Conversation not found")

    # 2. Verify conversation ownership
    statement = select(Repository).where(
        Repository.id == conversation.repo_id,
        Repository.user_uid == uid,
    )

    result = await db.execute(statement)

    if result.scalar_one_or_none() is None:
        raise HTTPException(404, "Conversation not found")

    # 3. Fetch previous conversation messages
    statement = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(
            Message.created_at.desc(),
            Message.id.desc(),
        )
        .limit(MAX_CONTEXT_MESSAGES)
    )

    result = await db.execute(statement)
    previous_messages = list(reversed(result.scalars().all()))

    context = [
        {
            "role": "user" if msg.role == "user" else "assistant",
            "content": msg.content,
        }
        for msg in previous_messages
        if msg.role in ("user", "agent") and msg.content
    ]

    # 4. Save current user message
    user_message = await create_message(
        db=db,
        conversation=conversation,
        content=request.content,
        role="user",
    )

    user_message_id = user_message.id

    try:
        # 5. Generate agent response
        answer = await run_agent(
            message=request.content,
            db=db,
            repo_id=conversation.repo_id,
            branch=request.branch,
            context=context,
        )

        # 6. Save agent response
        agent_message = await create_message(
            db=db,
            conversation=conversation,
            content=answer,
            role="agent",
        )

        return agent_message

    except Exception as e:
        # 7. Roll back any failed database transaction
        await db.rollback()

        # 8. Delete ONLY this request's user message
        await db.execute(
            sql_delete(Message).where(
                Message.id == user_message_id,
                Message.conversation_id == conversation_id,
            )
        )

        await db.commit()

        logger.exception(
            "Failed to process message %s",
            user_message_id,
        )

        raise HTTPException(
            status_code=502,
            detail="Failed to generate response. Your message was not saved.",
        ) from e

    

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

