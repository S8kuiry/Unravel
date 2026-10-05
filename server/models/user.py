from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import Boolean, Column, DateTime, String, Text

from db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    firebase_uid = Column(String, primary_key=True, index=True)
    email = Column(String, nullable=True,unique=True)
    display_name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    method = Column(String, nullable=False)  # how they FIRST signed up: 'google' | 'github'

    git_authorized = Column(Boolean, nullable=False, default=False)
    github_login = Column(String, nullable=True)
    github_token_encrypted = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    last_login_at = Column(DateTime(timezone=True), default=_utcnow)


# ---------- Pydantic schemas ----------

class UserSyncRequest(BaseModel):
    """Sent by Next.js after any Firebase login."""
    email: Optional[EmailStr] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    method: str = Field(..., pattern="^(google|github)$")
    # Only present when the user just signed in WITH GitHub:
    github_login: Optional[str] = None
    github_access_token: Optional[str] = None


class GithubConnectRequest(BaseModel):
    """Sent by Next.js after a Google user links GitHub (linkWithPopup)."""
    github_login: str
    github_access_token: str


class UserResponse(BaseModel):
    """Sanitized user data for the frontend. Never includes the token."""
    model_config = ConfigDict(from_attributes=True)

    firebase_uid: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    method: str
    git_authorized: bool = False
    github_login: Optional[str] = None
    created_at: datetime
    last_login_at: datetime

    
class UserSyncResponse(BaseModel):
    status: str
    message: str
    user: UserResponse


class GithubApproveRequest(BaseModel):
    github_access_token: str
    github_login: str