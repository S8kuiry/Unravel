import uuid
from datetime import datetime, timezone
from uuid import UUID
from typing import Literal
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship
from pydantic import BaseModel, ConfigDict, Field
from db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=_uuid,
    )

    repo_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
    )

    title = Column(String(200), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
    )

    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    # Relationships
    repository = relationship(
        "Repository",
        back_populates="conversations",
    )

    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Message.created_at, Message.id",
    )

    __table_args__ = (
        Index(
            "ix_conversations_repo_updated",
            "repo_id",
            "updated_at",
        ),
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=_uuid,
    )

    conversation_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )

    # user, assistant, system, tool
    # Plain String allows adding future message roles.
    role = Column(String(20), nullable=False)

    content = Column(Text, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
    )

    # Relationships
    conversation = relationship(
        "Conversation",
        back_populates="messages",
    )

    __table_args__ = (
        Index(
            "ix_messages_conversation_created",
            "conversation_id",
            "created_at",
        ),
    )


# ==========================================
# CONVERSATION REQUESTS
# ==========================================

class ConversationCreateRequest(BaseModel):
    repo_id: UUID
    title: str | None = Field(default=None, max_length=200)



# ==========================================
# MESSAGE REQUESTS
# ==========================================

class MessageCreateRequest(BaseModel):
    content: str = Field(min_length=1)
    branch: str = Field(min_length=1)
    role: Literal["user", "agent"] = "user"
    context: list[dict] | None = None
    


# ==========================================
# MESSAGE RESPONSES
# ==========================================

class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    role: str
    content: str
    created_at: datetime


# ==========================================
# CONVERSATION RESPONSES
# ==========================================

class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    repo_id: UUID
    title: str | None
    created_at: datetime
    updated_at: datetime


class ConversationDetailResponse(ConversationResponse):
    messages: list[MessageResponse] = []


class ConversationListResponse(BaseModel):
    conversations: list[ConversationResponse]
    total: int

class ConversationRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
