from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

# Import your dependencies and schemas (update import paths if different)
from db.database import get_db
from security.auth import get_current_uid
from crud.user import approve_github, get_user_by_firebase_uid, upsert_user, disconnect_github
from models.user import GithubApproveRequest, UserSyncRequest, UserResponse, UserSyncResponse

router = APIRouter(prefix="/user",tags=["User"])

@router.post("/sync",response_model=UserSyncResponse)
async def sync_user(
    body: UserSyncRequest,
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    user =  await upsert_user(
        db,
        firebase_uid=uid,
        method=body.method,
        email=body.email,
        display_name=body.display_name,
        avatar_url=body.avatar_url,
        github_login=body.github_login,
        github_token=body.github_access_token,
    )

    return {
            "status": "success",
            "message": "User Synced successfully",
            "user": user,
    }


@router.get("/account",response_model=UserSyncResponse)
async def  get_user(
    db: AsyncSession = Depends(get_db),
    uid: str = Depends(get_current_uid),
):
    user = await get_user_by_firebase_uid(db, uid)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "status": "success",
        "message": "User fetched successfully",
        "user": user,
    }



@router.post("/github/disconnect")
async def github_disconnect(
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    user = await disconnect_github(db, uid)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "status": "success",
            "message": "GitHub access revoked successfully",
            "git_authorized": user.git_authorized,
            "github_login": user.github_login,
    }



@router.post("/github/approve")
async def github_approve(
    body: GithubApproveRequest,
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    user = await approve_github(
        db=db,
        firebase_uid=uid,
        github_token=body.github_access_token,
        github_login=body.github_login,
    )
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
        
    return {
        "status": "success",
        "message": "GitHub access authorized successfully",
        "git_authorized": user.git_authorized,
        "github_login": user.github_login,
    }