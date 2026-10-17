import uuid
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, ForeignKey, Integer,
    String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class Repository(Base):
    __tablename__ = "repositories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_uid = Column(
        String, ForeignKey("users.firebase_uid", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    github_id = Column(BigInteger, nullable=False)  # stable across renames
    owner = Column(String, nullable=False)
    name = Column(String, nullable=False)
    is_private = Column(Boolean, nullable=False, default=False)
    default_branch = Column(String, nullable=False, default="main")

    last_opened_at = Column(DateTime(timezone=True), nullable=True)  # sidebar list
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    # Relationships
    files = relationship("RepoFile", cascade="all, delete-orphan", passive_deletes=True)
    blobs = relationship("RepoBlob", cascade="all, delete-orphan", passive_deletes=True)

    __table_args__ = (
        UniqueConstraint("user_uid", "github_id", name="uq_repo_user_github"),
    )


class RepoBlob(Base):
    """Content cache per repository file path (strictly one row per file path)."""
    __tablename__ = "repo_blobs"

    repo_id = Column(
        UUID(as_UUID=True) if "UUID" in globals() else UUID(as_uuid=True), 
        ForeignKey("repositories.id", ondelete="CASCADE"),
        primary_key=True,
    )
    path = Column(String, primary_key=True)  # Keyed by path for clean in-place replacement
    
    sha = Column(String, nullable=False)     # Current Git blob SHA of this cached content
    content = Column(Text, nullable=True)   # NULL until fetched
    is_binary = Column(Boolean, nullable=False, default=False)
    fetched_at = Column(DateTime(timezone=True), default=_utcnow)


class RepoFile(Base):
    """Branch-specific file tree: maps paths and branches to a blob SHA."""
    __tablename__ = "repo_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    repo_id = Column(
        UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    branch = Column(String, nullable=False)
    path = Column(String, nullable=False)
    sha = Column(String, nullable=False)    # References the commit/file version SHA
    size = Column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("repo_id", "branch", "path", name="uq_file_repo_branch_path"),
    )


class FileContentsRequest(BaseModel):
    paths: list[str]