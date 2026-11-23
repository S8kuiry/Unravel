
from uuid import UUID
from datetime import datetime, timezone
from fastapi import  HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from models.conversation import Conversation,Message
from sqlalchemy import select, func
from sqlalchemy import delete, or_, select
import asyncio
import json
import logging
from models.conversation import (

    Message,
    MessageCreateRequest,
)
logger = logging.getLogger(__name__)
from models.github import Repository
from models.conversation import Conversation
from services.agent.agent import run_agent


MAX_CONTEXT_MESSAGES = 6


async def title_exists(
    db: AsyncSession,
    repo_id: UUID,
    title: str,
    exclude_id: UUID,
) -> bool:
    """True if another conversation in this repo already has this title."""
    statement = (
        select(Conversation.id)
        .where(
            Conversation.repo_id == repo_id,
            Conversation.id != exclude_id,
            func.lower(Conversation.title) == title.lower(),
        )
        .limit(1)
    )
    result = await db.execute(statement)
    return result.first() is not None


async def make_unique_title(
    db: AsyncSession,
    repo_id: UUID,
    title: str,
    exclude_id: UUID,
) -> str:
    """Return the title, or 'Title (N)' where N = highest existing suffix + 1."""
    if not await title_exists(db, repo_id, title, exclude_id):
        return title

    base = title[:50]  # leave room for the suffix

    statement = select(Conversation.title).where(
        Conversation.repo_id == repo_id,
        Conversation.id != exclude_id,
        func.lower(Conversation.title).like(base.lower() + " (%)"),
    )
    result = await db.execute(statement)

    prefix = base.lower() + " ("
    highest = 1  # the plain title counts as copy 1
    for (t,) in result.all():
        t = (t or "").lower()
        if t.startswith(prefix) and t.endswith(")") and t[len(prefix):-1].isdigit():
            highest = max(highest, int(t[len(prefix):-1]))

    return f"{base} ({highest + 1})"



async def create_conversation(
    db: AsyncSession,
    repo_id,
    title: str | None = None,
) -> Conversation:
    conversation = Conversation(
        repo_id=repo_id,
        title=title,
    )

    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)

    return conversation



async def  get_repository_conversations(
        db : AsyncSession,
        repo_id : UUID

) -> list[Conversation]: 
    statement = (
        select(Conversation)
        .where(Conversation.repo_id == repo_id)
        .order_by(Conversation.updated_at.desc())
    )

    result = await db.execute(statement)

    return list(result.scalars().all())




async def get_conversation_by_id(
    db: AsyncSession,
    conversation_id: UUID,
) -> Conversation | None :
    statement = (
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id)
    )
    result = await db.execute(statement)
    return result.scalar_one_or_none()



async def rename_conversation(
    db: AsyncSession,
    conversation: Conversation,
    title: str,
)-> Conversation:
    conversation.title = title

    await db.commit()
    await db.refresh(conversation)

    return conversation




async def delete_conversation(
    db: AsyncSession,
    conversation: Conversation,
) -> None:

    await db.delete(conversation)
    await db.commit()



async def create_message(
    db: AsyncSession,
    conversation: Conversation,
    content: str,
    role: str,

) -> Message:



    message = Message(
        conversation_id=conversation.id,
        role=role,
        content=content,
    )

    db.add(message)

    # Update conversation activity
    conversation.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(message)

    return message



def _format_sse_event(event: dict) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


def _serialize_message(message: Message) -> dict:
    return {
        "id": str(message.id),
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at.isoformat(),
    }


async def _get_owned_conversation(
    db: AsyncSession,
    conversation_id: UUID,
    uid: str,
) -> Conversation:
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

    return conversation


async def _build_recent_context(
    db: AsyncSession,
    conversation_id: UUID,
    limit: int = MAX_CONTEXT_MESSAGES,
) -> list[dict[str, str]]:
    statement = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(limit)
    )
    result = await db.execute(statement)
    previous_messages = list(reversed(result.scalars().all()))

    return [
        {
            "role": "user" if msg.role == "user" else "assistant",
            "content": msg.content,
        }
        for msg in previous_messages
        if msg.role in ("user", "agent") and msg.content
    ]


async def _rollback_and_delete_message(
    db: AsyncSession,
    conversation_id: UUID,
    message_id: UUID,
) -> None:
    try:
        await db.rollback()
        await db.execute(
            delete(Message).where(
                Message.id == message_id,
                Message.conversation_id == conversation_id,
            )
        )
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception(
            "Failed to delete user message %s",
            message_id,
        )


async def _stream_agent_sse(
    db: AsyncSession,
    conversation: Conversation,
    request: MessageCreateRequest,
    context: list[dict[str, str]],
    user_message_id: UUID,
):
    completed = False

    try:
        final_answer = None

        async for event in run_agent(
            message=request.content,
            db=db,
            repo_id=conversation.repo_id,
            branch=request.branch,
            context=context,
        ):
            if event.get("type") == "agent_done":
                final_answer = event.get("answer")
                continue

            yield _format_sse_event(event)

        if final_answer is None:
            raise RuntimeError(
                "Agent finished without providing a final answer"
            )

        agent_message = await create_message(
            db=db,
            conversation=conversation,
            content=final_answer,
            role="agent",
        )
        completed = True

        yield _format_sse_event({
            "type": "agent_message_saved",
            "message": _serialize_message(agent_message),
        })

    except asyncio.CancelledError:
        if not completed:
            await _rollback_and_delete_message(
                db=db,
                conversation_id=conversation.id,
                message_id=user_message_id,
            )
        raise

    except Exception:
        logger.exception(
            "Failed to process message %s",
            user_message_id,
        )
        if not completed:
            await _rollback_and_delete_message(
                db=db,
                conversation_id=conversation.id,
                message_id=user_message_id,
            )
        yield _format_sse_event({
            "type": "error",
            "message": "Failed to generate response.",
        })


