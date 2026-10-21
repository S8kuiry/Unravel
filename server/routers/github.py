from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from security.auth import get_current_uid
from crud.github import (
    get_github_profile,
    get_github_repositories,
    get_repository_files,
    get_repository_file_contents,
    get_opened_repositories,
    delete_repo_by_id
)
from models.github import FileContentsRequest
import uuid


router = APIRouter(
    prefix="/github",
    tags=["GitHub"],
)


@router.get("/profile")
async def github_profile(
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    try:
        profile = await get_github_profile(
            db=db,
            firebase_uid=uid,
        )

        if profile is None:
            raise HTTPException(
                status_code=403,
                detail="GitHub access is not authorized",
            )

        return {
            "status": "success",
            "message": "GitHub profile fetched successfully",
            "data": profile,
        }

    except ValueError as e:
        raise HTTPException(
            status_code=401,
            detail=str(e),
        )

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch GitHub profile",
        )


@router.get("/repositories")
async def github_repositories(
    page:int, 
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    try:
        repositories = await get_github_repositories(
            db=db,
            firebase_uid=uid,
            page=page
        )

        if repositories is None:
            raise HTTPException(
                status_code=403,
                detail="GitHub access is not authorized",
            )

        return {
            "status": "success",
            "message": "GitHub repositories fetched successfully",
            "data": repositories["repos"],
            "page": repositories["page"],         
            "hasNextPage": repositories["hasNextPage"]
        }

    except ValueError as e:
        raise HTTPException(
            status_code=401,
            detail=str(e),
        )

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch GitHub repositories",
        )


@router.get("/repositories/{owner}/{repo}/files")
async def repository_files(
    owner: str,
    repo: str,
    branch: str = Query("main"),
    force: bool = Query(False),
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    try:
        files = await get_repository_files(
            db=db,
            firebase_uid=uid,
            owner=owner,
            repo=repo,
            branch=branch,  # <-- Pass branch down
            force=force
        )

        if files is None:
            raise HTTPException(
                status_code=403,
                detail="GitHub access is not authorized",
            )

        return {
            "status": "success",
            "message": "Repository files fetched successfully",
            "data": files,
        }

    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    except HTTPException:
        raise

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch repository files",
        )


@router.post("/repositories/{owner}/{repo}/contents")
async def repository_file_contents(
    owner: str,
    repo: str,
    body: FileContentsRequest,
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    try:
        if not body.paths or len(body.paths) > 100:
            raise HTTPException(
                status_code=400,
                detail="Provide between 1 and 100 file paths",
            )

        contents = await get_repository_file_contents(
            db=db,
            firebase_uid=uid,
            owner=owner,
            repo=repo,
            branch=body.branch,
            paths=body.paths,
        )

        if contents is None:
            raise HTTPException(
                status_code=403,
                detail="GitHub access is not authorized",
            )

        return {
            "status": "success",
            "message": "File contents fetched successfully",
            "data": contents,
        }

    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    except HTTPException:
        raise

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch file contents",
        )


@router.get("/opened-repositories")
async def opened_repositories(
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    try:
        res = await get_opened_repositories(db, uid)

        return {
            "status": "success",
            "message": "Opened repositories fetched successfully",
            "data": res,
        }
    except ValueError as e:
            raise HTTPException(status_code=403, detail=str(e))
    
    except HTTPException:
            raise
    
    except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=500,
                detail="Failed to fetch file contents",
            )


@router.delete("/repositories/{repo_id}")
async def delete_repository_endpoint(
    repo_id: uuid.UUID,
    uid: str = Depends(get_current_uid),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_repo_by_id(db, uid, repo_id)

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Repository not found",
        )

    return {
        "status": "success",
        "message": "Repository removed successfully",
    }

    

# @router.get("/collaborator-repositories")
# async def collaborator_repositories(
#     uid: str = Depends(get_current_uid),
#     db: AsyncSession = Depends(get_db),
# ):
#     try:
#         repositories = await get_collaborator_repositories(
#             db=db,
#             firebase_uid=uid,
#         )

#         if repositories is None:
#             raise HTTPException(
#                 status_code=403,
#                 detail="GitHub access is not authorized",
#             )

#         return {
#             "status": "success",
#             "message": "Collaborator repositories fetched successfully",
#             "data": repositories,
#         }

#     except ValueError as e:
#         raise HTTPException(
#             status_code=401,
#             detail=str(e),
#         )

#     except HTTPException:
#         raise

#     except Exception:
#         raise HTTPException(
#             status_code=500,
#             detail="Failed to fetch collaborator repositories",
#         )


# @router.get("/organizations")
# async def github_organizations(
#     uid: str = Depends(get_current_uid),
#     db: AsyncSession = Depends(get_db),
# ):
#     try:
#         organizations = await get_github_organizations(
#             db=db,
#             firebase_uid=uid,
#         )

#         if organizations is None:
#             raise HTTPException(
#                 status_code=403,
#                 detail="GitHub access is not authorized",
#             )

#         return {
#             "status": "success",
#             "message": "GitHub organizations fetched successfully",
#             "data": organizations,
#         }

#     except ValueError as e:
#         raise HTTPException(
#             status_code=401,
#             detail=str(e),
#         )

#     except HTTPException:
#         raise

#     except Exception:
#         raise HTTPException(
#             status_code=500,
#             detail="Failed to fetch GitHub organizations",
#         )


# @router.get("/organizations/{organization}/repositories")
# async def organization_repositories(
#     organization: str,
#     uid: str = Depends(get_current_uid),
#     db: AsyncSession = Depends(get_db),
# ):
#     try:
#         repositories = await get_organization_repositories(
#             db=db,
#             firebase_uid=uid,
#             organization=organization,
#         )

#         if repositories is None:
#             raise HTTPException(
#                 status_code=403,
#                 detail="GitHub access is not authorized",
#             )

#         return {
#             "status": "success",
#             "message": "Organization repositories fetched successfully",
#             "data": repositories,
#         }

#     except ValueError as e:
#         raise HTTPException(
#             status_code=403,
#             detail=str(e),
#         )

#     except HTTPException:
#         raise

#     except Exception:
#         raise HTTPException(
#             status_code=500,
#             detail="Failed to fetch organization repositories",
#         )


# @router.get("/shared-repositories")
# async def shared_repositories(
#     uid: str = Depends(get_current_uid),
#     db: AsyncSession = Depends(get_db),
# ):
#     try:
#         repositories = await get_shared_repositories(
#             db=db,
#             firebase_uid=uid,
#         )

#         if repositories is None:
#             raise HTTPException(
#                 status_code=403,
#                 detail="GitHub access is not authorized",
#             )

#         return {
#             "status": "success",
#             "message": "Shared repositories fetched successfully",
#             "data": repositories,
#         }

#     except ValueError as e:
#         raise HTTPException(
#             status_code=401,
#             detail=str(e),
#         )

#     except HTTPException:
#         raise

#     except Exception:
#         raise HTTPException(
#             status_code=500,
#             detail="Failed to fetch shared repositories",
#         )




