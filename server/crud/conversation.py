
from sqlalchemy.ext.asyncio import AsyncSession

from models.conversation import Conversation


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
