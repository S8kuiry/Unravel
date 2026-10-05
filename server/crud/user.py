from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from security.crypto import encrypt_token
from models.user import User


async def upsert_user(
    db: AsyncSession,
    firebase_uid: str,
    method: str,
    email: Optional[str] = None,
    display_name: Optional[str] = None,
    avatar_url: Optional[str] = None,
    github_login: Optional[str] = None,
    github_token: Optional[str] = None,
) -> User:
    """
    Single source of truth for saving a user.
    - New user: create the record (`method` is set here and never changed).
    - Existing user: refresh profile details and last_login_at.
    - GitHub token present: store it encrypted and set git_authorized = True.
    - GitHub token null: GitHub fields are left exactly as they were.
    """
    now = datetime.now(timezone.utc)

    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalars().first()

    if not user:
        user = User(
            firebase_uid=firebase_uid,
            email=email,
            display_name=display_name,
            avatar_url=avatar_url,
            method=method,  # first signup method, set once
            last_login_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(user)
    else:
        if email:
            user.email = email
        if display_name:
            user.display_name = display_name
        if avatar_url:
            user.avatar_url = avatar_url
        user.last_login_at = now
        user.updated_at = now

    if github_token:
        user.github_token_encrypted = encrypt_token(github_token)
        user.git_authorized = True
        if github_login:
            user.github_login = github_login

    await db.commit()
    await db.refresh(user)
    return user


async def get_user_by_firebase_uid(
        db:AsyncSession,
        uid:str
):
    result = await db.execute(select(User).where(User.firebase_uid == uid))
    user = result.scalars().first()
    return user


async def disconnect_github(db: AsyncSession, firebase_uid: str) -> Optional[User]:
    """Revoke GitHub access: flag goes false, stored token is cleared."""
    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalars().first()
    if not user:
        return None

    user.git_authorized = False
    user.github_login = None
    user.github_token_encrypted = None
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user


async def approve_github(
    db: AsyncSession, 
    firebase_uid: str, 
    github_token: str, 
    github_login: str
) -> Optional[User]:
    """Approve GitHub access: flag goes true, token is encrypted and stored."""
    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalars().first()
    if not user:
        return None

    user.git_authorized = True
    user.github_login = github_login
    user.github_token_encrypted = encrypt_token(github_token)
    user.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(user)
    return user