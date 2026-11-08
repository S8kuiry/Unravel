
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from models.conversation import Conversation,Message


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

    # Deduplication: return existing message if the same
    # (conversation, role, content) already exists. Prevents
    # duplicate rows when the same request is sent more than once.
    existing = await db.execute(
        select(Message).where(
            Message.conversation_id == conversation.id,
            Message.role == role,
            Message.content == content,
        )
    )
    existing_message = existing.scalar_one_or_none()
    if existing_message is not None:
        return existing_message

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

