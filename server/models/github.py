import uuid
from datetime import datetime, timezone
import os
from pydantic import BaseModel
from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, ForeignKey, Integer,
    String, Text, UniqueConstraint,ForeignKeyConstraint, Index,text,
    CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from dotenv import load_dotenv
from db.database import Base


load_dotenv()
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

    last_opened_at = Column(DateTime(timezone=True), nullable=True, default=_utcnow)  # sidebar list / last-opened section — always stamped on open
    created_at = Column(DateTime(timezone=True), default=_utcnow)


    # Relationships
    files = relationship("RepoFile", cascade="all, delete-orphan", passive_deletes=True)
    blobs = relationship("RepoBlob", cascade="all, delete-orphan", passive_deletes=True)
    sync_states = relationship("RepoSyncState", cascade="all, delete-orphan", passive_deletes=True)
    chunks = relationship("RepoChunk", cascade="all, delete-orphan", passive_deletes=True)

    __table_args__ = (
        UniqueConstraint("user_uid", "github_id", name="uq_repo_user_github"),
    )


class RepoBlob(Base):
    """Content cache per repository file path (strictly one row per file path)."""
    __tablename__ = "repo_blobs"

    repo_id = Column(
        UUID(as_uuid=True),
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




class RepoSyncState(Base):
    """When a repo's branch file list was last pulled from GitHub (cache freshness)."""
    __tablename__ = "repo_sync_state"

    repo_id = Column(
        UUID(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        primary_key=True,
    )
    branch = Column(String, primary_key=True)
    

    last_synced_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    tree_truncated = Column(Boolean, nullable=False, default=False)
    tarball_ok = Column(Boolean, nullable=True)  # set by /files, read by /hydrate




EMBED_DIM = int(os.getenv("EMBED_DIM", "768"))

class RepoChunk(Base):
    """Chunks of one file on one branch. Embedding is filled in later."""
    __tablename__ = "repo_chunks"

    repo_id = Column(
        UUID(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        primary_key=True,
    )
    branch = Column(String, primary_key=True)
    path = Column(String, primary_key=True)
    name = Column(String, nullable=True)  # function/class/heading from the chunker
    chunk_index = Column(Integer, primary_key=True)
    blob_sha = Column(String, nullable=False)  # RepoFile.sha these chunks were cut from
    content = Column(Text, nullable=False)
    start_line = Column(Integer, nullable=False)
    end_line = Column(Integer, nullable=False)

    embedding = Column(Vector(EMBED_DIM), nullable=True)  # NULL = not embedded yet

    __table_args__ = (
        ForeignKeyConstraint(
            ["repo_id", "branch", "path"],
            ["repo_files.repo_id", "repo_files.branch", "repo_files.path"],
            ondelete="CASCADE",
        ),
        # embedding worker: find unembedded rows quickly
        Index("ix_chunks_pending", "repo_id", postgresql_where=text("embedding IS NULL")),
        # fast vector search (this is what makes search fast)
        Index(
            "ix_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
            postgresql_where=text("embedding IS NOT NULL"),
        ),
        # fast symbol lookup: name ILIKE '%order%'
        Index(
            "ix_chunks_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )

class RepoIndexJob(Base):
    """
    Tracks indexing progress for one file version
    in one repository branch.
    """
    __tablename__ = "repo_index_jobs"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),  # 👈 Database-side default
    )

    repo_id = Column(
        UUID(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
    )

    branch = Column(String, nullable=False)
    path = Column(String, nullable=False)

    # Identifies the exact file version being indexed
    blob_sha = Column(String, nullable=False)

    # Job lifecycle
    status = Column(
        String(20),
        nullable=False,
        server_default=text("'pending'"),  # 👈 Database-side default
    )

    # Retry tracking
    attempts = Column(Integer, nullable=False, server_default=text("0"))
    max_attempts = Column(Integer, nullable=False, server_default=text("5"))

    # When this job becomes eligible for processing
    available_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),  # 👈 Database-side default
    )

    # Worker lease: helps recover abandoned jobs
    locked_by = Column(String, nullable=True)
    lease_expires_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Error tracking
    last_error = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),  # 👈 Database-side default
    )

    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),  # 👈 Database-side default
        onupdate=_utcnow,
    )

    completed_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        # Prevent duplicate jobs for the same file version
        UniqueConstraint(
            "repo_id",
            "branch",
            "path",
            "blob_sha",
            name="uq_repo_index_job_file_version",
        ),

        CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed', 'skipped')",
            name="ck_repo_index_job_status",
        ),

        CheckConstraint(
            "attempts >= 0 AND max_attempts > 0",
            name="ck_repo_index_job_attempts",
        ),

        # Quickly find jobs waiting to be processed
        Index(
            "ix_repo_index_jobs_pending",
            "available_at",
            postgresql_where=text("status = 'pending'"),
        ),

        # Quickly find jobs whose worker lease has expired
        Index(
            "ix_repo_index_jobs_processing_lease",
            "lease_expires_at",
            postgresql_where=text("status = 'processing'"),
        ),
    )




class FileContentsRequest(BaseModel):
    paths: list[str]
    branch: str = "main"