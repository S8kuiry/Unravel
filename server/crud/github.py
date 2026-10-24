from typing import Optional
import httpx
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
import asyncio
from urllib.parse import quote
from models.user import User
from models.github import Repository, RepoFile, RepoBlob, _utcnow,RepoSyncState
from security.crypto import decrypt_token
from datetime import timedelta

SYNC_TTL = timedelta(minutes=10)  # how long a synced file list counts as fresh


GITHUB_API_URL = "https://api.github.com"

def make_client() -> httpx.AsyncClient:
    transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0")
    return httpx.AsyncClient(timeout=10, transport=transport)


IGNORED_DIRS = {
    "node_modules", ".git", "dist", "build", ".next",
    "venv", ".venv", "__pycache__", "coverage", "vendor",
}
IGNORED_EXT = (
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
    ".pdf", ".zip", ".lock", ".woff", ".woff2", ".ttf",
    ".mp4", ".mp3", ".min.js", ".map",
)
IGNORED_FILES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml"}
MAX_FILE_SIZE = 100_000  # bytes




def github_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "FastAPI-App",  # GitHub API requires a User-Agent header
    }


async def get_github_token(
    db: AsyncSession,
    firebase_uid: str,
) -> Optional[str]:
    """
    Get the user's encrypted GitHub token from DB
    and decrypt it inside the backend.
    """

    result = await db.execute(
        select(User).where(User.firebase_uid == firebase_uid)
    )

    user = result.scalars().first()

    if not user:
        return None

    if not user.git_authorized:
        return None

    if not user.github_token_encrypted:
        return None

    return decrypt_token(user.github_token_encrypted)


async def get_github_profile(
    db: AsyncSession,
    firebase_uid: str,
):
    """
    Fetch the authenticated GitHub user's profile.
    """

    token = await get_github_token(db, firebase_uid)

    if not token:
        return None

    async with make_client() as client:
        response = await client.get(
            f"{GITHUB_API_URL}/user",
            headers=github_headers(token),
        )

    if response.status_code == 401:
        raise ValueError("GitHub token is invalid or expired")

    response.raise_for_status()

    return response.json()



async def get_github_repositories(
    db: AsyncSession,
    firebase_uid: str,
    page: int = 1,
    per_page: int = 30,
):
    """
    Fetch a paginated list of repositories accessible to the authenticated GitHub user.
    """
    token = await get_github_token(db, firebase_uid)

    if not token:
        return {"repos": [], "page": page, "hasNextPage": False}

    async with make_client() as client:
        response = await client.get(
            f"{GITHUB_API_URL}/user/repos",
            headers=github_headers(token),
            params={
                "page": page,
                "per_page": per_page,
                "sort": "updated",
                "direction": "desc",
                "visibility": "all",
                "affiliation": "owner,collaborator,organization_member",
            },
        )

    if response.status_code == 401:
        raise ValueError("GitHub token is invalid or expired")

    response.raise_for_status()
    raw_repos = response.json()

    # Clean and map the response to a lightweight schema including the default branch
    repos = []
    for r in raw_repos:
        repos.append({
            "id": r.get("id"),
            "name": r.get("name"),
            "owner": {
                "login": r.get("owner", {}).get("login"),
                "type": r.get("owner", {}).get("type"),
            },
            "private": r.get("private"),
            "description": r.get("description"),
            "language": r.get("language"),
            "pushed_at": r.get("pushed_at"),
            "html_url": r.get("html_url"),
            "default_branch": r.get("default_branch"),  # Added branch field here
            

        })

    # Check GitHub's HTTP Link header to see if a next page exists
    link_header = response.headers.get("link", "")
    has_next_page = 'rel="next"' in link_header

    return {
        "repos": repos,
        "page": page,
        "hasNextPage": has_next_page,
    }


async def get_github_repository_branches(
    db: AsyncSession,
    firebase_uid: str,
    owner: str,
    repo_name: str,
):
    """
    Fetch all branches of a GitHub repository,
    automatically handling pagination.
    """
    token = await get_github_token(db, firebase_uid)

    if not token:
        return {"branches": []}

    branches = []
    page = 1

    async with make_client() as client:
        while True:
            response = await client.get(
                f"{GITHUB_API_URL}/repos/{owner}/{repo_name}/branches",
                headers=github_headers(token),
                params={
                    "page": page,
                    "per_page": 100,
                },
            )

            if response.status_code == 401:
                raise ValueError("GitHub token is invalid or expired")

            response.raise_for_status()

            raw_branches = response.json()

            branches.extend(
                branch["name"]
                for branch in raw_branches
            )

            # GitHub indicates whether another page exists
            link_header = response.headers.get("Link", "")

            if 'rel="next"' not in link_header:
                break

            page += 1

    return {"branches": branches}


async def touch_last_opened(db: AsyncSession, repo: Repository) -> None:
    """Stamp last_opened_at = now() so the last-opened section never sees NULL.

    Called on every user-visible open path (files list + file contents).
    Uses flush (not commit) so the caller controls the transaction and no
    unflushed file/sync rows are lost.
    """
    repo.last_opened_at = _utcnow()
    await db.flush()


async def get_or_create_repository(
    db: AsyncSession,
    token: str,
    firebase_uid: str,
    owner: str,
    repo: str,
) -> Repository:
    result = await db.execute(
        select(Repository).where(
            Repository.user_uid == firebase_uid,
            Repository.owner == owner,
            Repository.name == repo,
        )
    )
    db_repo = result.scalars().first()
    if db_repo:
        # Every open counts: keep last_opened_at fresh (fixes legacy NULL rows).
        await touch_last_opened(db, db_repo)
        return db_repo

    # First time this user opens this repo: ask GitHub for the real details
    async with make_client() as client:
        r = await client.get(
            f"{GITHUB_API_URL}/repos/{owner}/{repo}",
            headers=github_headers(token),
        )

    if r.status_code == 401:
        raise ValueError("GitHub token is invalid or expired")
    if r.status_code in (403, 404):
        raise ValueError("Repository or branch not found, or no access")
    r.raise_for_status()
    info = r.json()

    stmt = insert(Repository).values(
        user_uid=firebase_uid,
        github_id=info["id"],
        owner=owner,
        name=repo,
        is_private=info.get("private", False),
        default_branch=info.get("default_branch", "main"),
        last_opened_at=_utcnow(),
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_uid", "github_id"],
        set_={
            "owner": stmt.excluded.owner,
            "name": stmt.excluded.name,
            "is_private": stmt.excluded.is_private,
            "default_branch": stmt.excluded.default_branch,
            "last_opened_at": stmt.excluded.last_opened_at,
        },
    ).returning(Repository)

    res = await db.execute(stmt)
    db_repo = res.scalars().first()
    await db.commit()
    await db.refresh(db_repo)
    return db_repo



def is_necessary_file(item: dict) -> bool:
    if item["type"] != "blob":
        return False
    if item.get("size", 0) > MAX_FILE_SIZE:
        return False

    parts = item["path"].split("/")
    if any(p in IGNORED_DIRS for p in parts[:-1]):
        return False

    name = parts[-1]
    if name in IGNORED_FILES:
        return False

    return not name.lower().endswith(IGNORED_EXT)


async def read_cached_files(db: AsyncSession, repo_id, branch: str):
    """Return the stored file list if it was synced recently, otherwise None."""
    sync = await db.get(RepoSyncState, (repo_id, branch))
    if not sync or _utcnow() - sync.last_synced_at > SYNC_TTL:
        return None

    result = await db.execute(
        select(RepoFile.path, RepoFile.size).where(
            RepoFile.repo_id == repo_id,
            RepoFile.branch == branch,
        )
    )
    return {
        "truncated": sync.tree_truncated,
        "branch": branch,
        "files": [{"path": p, "size": s or 0} for p, s in result.all()],
    }

async def get_repository_files(
    db: AsyncSession,
    firebase_uid: str,
    owner: str,
    repo: str,
    branch: str = "main",  # <-- Added branch parameter (defaults to "main")
    force: bool = False,

):
    """List the necessary files in a repo for a specific branch, and sync them to DB."""

    token = await get_github_token(db, firebase_uid)

    if not token:
        return None

    db_repo = await get_or_create_repository(db, token, firebase_uid, owner, repo)
    # NOTE: get_or_create_repository already stamped last_opened_at via
    # touch_last_opened(), so even the cached early-return below is fresh.

    if not force:
        cached = await read_cached_files(db, db_repo.id, branch)
        if cached is not None:
            await db.commit()  # persist the last_opened_at touch from get_or_create
            return cached
        

    async with make_client() as client:
        # 1. Fetch tree from GitHub using the requested branch name
        response = await client.get(
            f"{GITHUB_API_URL}/repos/{owner}/{repo}/git/trees/{branch}",
            headers=github_headers(token),
            params={"recursive": "1"},
        )

    if response.status_code == 401:
        raise ValueError("GitHub token is invalid or expired")

    if response.status_code in (403, 404):
        raise ValueError("Repository or branch not found, or no access")

    response.raise_for_status()

    data = response.json()
    tree_items = data.get("tree", [])

    # Filter files using your helper function
    filtered_files = [
        {"path": i["path"], "sha": i["sha"], "size": i.get("size", 0)}
        for i in tree_items
        if is_necessary_file(i)
    ]

    if db_repo and filtered_files:
        print(f"Bulk saving {len(filtered_files)} files for repo ID: {db_repo.id}")
        
        # 1. Prepare all records as a list of dictionaries
        file_records = [
            {
                "repo_id": db_repo.id,
                "branch": branch,
                "path": file_info["path"],
                "sha": file_info["sha"],
                "size": file_info["size"],
            }
            for file_info in filtered_files
        ]
        
        # 2. Execute as a single bulk operation
        stmt = insert(RepoFile).values(file_records)
        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=["repo_id", "branch", "path"],
            set_={
                "sha": stmt.excluded.sha,
                "size": stmt.excluded.size,
            }
        )
        await db.execute(upsert_stmt)
        await db.commit()
        print("Successfully committed files in bulk!")
    
    sync_stmt = insert(RepoSyncState).values(
        repo_id=db_repo.id,
        branch=branch,
        last_synced_at=_utcnow(),
        tree_truncated=data.get("truncated", False),
    )
    await db.execute(
        sync_stmt.on_conflict_do_update(
            index_elements=["repo_id", "branch"],
            set_={
                "last_synced_at": sync_stmt.excluded.last_synced_at,
                "tree_truncated": sync_stmt.excluded.tree_truncated,
            },
        )
    )
    await db.commit()

    # Refresh the open timestamp after a successful sync as well (covers the
    # full-fetch path even if the earlier touch committed before GitHub I/O).
    await touch_last_opened(db, db_repo)
    await db.commit()

    return {
        "truncated": data.get("truncated", False),
        "branch": branch,
        "files": [{"path": f["path"], "size": f["size"]} for f in filtered_files],
    }


async def get_repository_file_contents(
    db: AsyncSession,
    firebase_uid: str,
    owner: str,
    repo: str,
    branch: str,  # <-- Added branch parameter to ensure accurate context
    paths: list[str],
):
    """Fetch raw text content for the given file paths, utilizing the RepoBlob cache."""

    token = await get_github_token(db, firebase_uid)

    if not token:
        return None
    

    # 1. Fetch repository record from DB to get its UUID
    repo_result = await db.execute(
        select(Repository).where(
            Repository.user_uid == firebase_uid,  
            Repository.owner == owner,
            Repository.name == repo
        )
    )
    db_repo = repo_result.scalars().first()
    if not db_repo:
        raise ValueError("Repository not found in database")

    # Opening file contents counts as opening the repo.
    await touch_last_opened(db, db_repo)

    headers = {
        **github_headers(token),
        "Accept": "application/vnd.github.raw+json",
    }
    semaphore = asyncio.Semaphore(10)  # max 10 parallel requests

    async with make_client() as client:

        async def fetch_single_file(path: str):
            # Step A: Check if we have a valid cached blob for this path in RepoBlob
            blob_result = await db.execute(
                select(RepoBlob).where(
                    RepoBlob.repo_id == db_repo.id,
                    RepoBlob.path == path
                )
            )
            cached_blob = blob_result.scalars().first()

            # Step B: Check what SHA this path currently expects on this branch from RepoFile
            file_result = await db.execute(
                select(RepoFile).where(
                    RepoFile.repo_id == db_repo.id,
                    RepoFile.branch == branch,
                    RepoFile.path == path
                )
            )
            repo_file = file_result.scalars().first()
            expected_sha = repo_file.sha if repo_file else None

            # Cache Hit: If cached blob exists, content is present, and SHA matches -> serve instantly from DB!
            if cached_blob and cached_blob.content is not None and (not expected_sha or cached_blob.sha == expected_sha):
                return {"path": path, "content": cached_blob.content}

            # Cache Miss or Outdated SHA: Fetch from GitHub API
            async with semaphore:
                r = await client.get(
                    f"{GITHUB_API_URL}/repos/{owner}/{repo}/contents/{quote(path)}",
                    headers=headers,
                    params={"ref": branch},  # Ensure we fetch from the specified branch reference
                )

            if r.status_code != 200:
                return {"path": path, "content": None}

            content = r.text
            # Use expected_sha if available, otherwise fallback to a placeholder or get it from headers if needed
            current_sha = expected_sha or "unknown"
            is_binary = False  # Set based on your binary detection logic if applicable

            # Step C: Upsert into path-keyed RepoBlob (replaces old content in-place cleanly)
            insert_stmt = insert(RepoBlob).values(
                repo_id=db_repo.id,
                path=path,
                sha=current_sha,
                content=content,
                is_binary=is_binary,
                fetched_at=_utcnow(),
            )
            upsert_stmt = insert_stmt.on_conflict_do_update(
                index_elements=["repo_id", "path"],
                set_={
                    "sha": insert_stmt.excluded.sha,
                    "content": insert_stmt.excluded.content,
                    "is_binary": insert_stmt.excluded.is_binary,
                    "fetched_at": insert_stmt.excluded.fetched_at,
                }
            )
            await db.execute(upsert_stmt)
            await db.commit()

            return {"path": path, "content": content}

        return await asyncio.gather(*(fetch_single_file(p) for p in paths))



async def get_opened_repositories(
    db: AsyncSession,
    firebase_uid: str,
):
    result = await db.execute(
        select(Repository)
        .where(Repository.user_uid == firebase_uid)
        .order_by(
            Repository.last_opened_at.desc().nulls_last(),
            Repository.created_at.desc(),
        )    )

    repos = result.scalars().all()

    # Self-heal legacy rows: if last_opened_at is NULL, fall back to created_at
    # so the "last opened" section always has a usable timestamp for fetching.
    # The next real open will overwrite this via touch_last_opened().
    needs_backfill = [r for r in repos if r.last_opened_at is None]
    if needs_backfill:
        now = _utcnow()
        for r in needs_backfill:
            fallback = r.created_at or now
            await db.execute(
                Repository.__table__.update()
                .where(Repository.id == r.id)
                .values(last_opened_at=fallback)
            )
            r.last_opened_at = fallback
        await db.commit()

    return [
        {
            "id": str(repo.id),
            "owner": repo.owner,
            "name": repo.name,
            "last_opened_at": (
                repo.last_opened_at.isoformat() if repo.last_opened_at else None
            ),
        }
        for repo in repos
    ]


async def delete_repo_by_id(
    db: AsyncSession,
    firebase_uid: str,
    repo_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        delete(Repository).where(
            Repository.id == repo_id,
            Repository.user_uid == firebase_uid,
        )
    )
    await db.commit()
    return result.rowcount > 0
# ---------------------------------------------------------
# COLLABORATOR REPOSITORIES
# ---------------------------------------------------------

# async def get_collaborator_repositories(
#     db: AsyncSession,
#     firebase_uid: str,
# ):
#     """
#     Fetch repositories where the authenticated GitHub user
#     has collaborator access.

#     Does NOT include repositories owned by the user.
#     Does NOT include organization repositories.
#     """

#     token = await get_github_token(
#         db=db,
#         firebase_uid=firebase_uid,
#     )

#     if not token:
#         return None

#     async with make_client() as client:


#         response = await client.get(
#             f"{GITHUB_API_URL}/user/repos",
#             headers=github_headers(token),
#             params={
#                 "affiliation": "collaborator",
#                 "visibility": "all",
#                 "sort": "updated",
#                 "per_page": 100,
#             },
#         )

#     if response.status_code == 401:
#         raise ValueError("GitHub token is invalid or expired")

#     response.raise_for_status()

#     return response.json()


# ---------------------------------------------------------
# ORGANIZATIONS
# ---------------------------------------------------------

# async def get_github_organizations(
#     db: AsyncSession,
#     firebase_uid: str,
# ):
#     """
#     Fetch organizations that the authenticated GitHub user
#     belongs to.
#     """

#     token = await get_github_token(
#         db=db,
#         firebase_uid=firebase_uid,
#     )

#     if not token:
#         return None

#     async with make_client() as client:


#         response = await client.get(
#             f"{GITHUB_API_URL}/user/orgs",
#             headers=github_headers(token),
#             params={
#                 "per_page": 100,
#             },
#         )

#     if response.status_code == 401:
#         raise ValueError("GitHub token is invalid or expired")
#     print("ORGS STATUS:", response.status_code, response.text)


#     response.raise_for_status()
    

#     return response.json()


# ---------------------------------------------------------
# ORGANIZATION REPOSITORIES
# ---------------------------------------------------------

# async def get_organization_repositories(
#     db: AsyncSession,
#     firebase_uid: str,
#     organization: str,
# ):
#     """
#     Fetch repositories from a GitHub organization.

#     The user's GitHub token determines which repositories
#     they are actually allowed to see.
#     """

#     token = await get_github_token(
#         db=db,
#         firebase_uid=firebase_uid,
#     )

#     if not token:
#         return None

#     async with make_client() as client:


#         response = await client.get(
#             f"{GITHUB_API_URL}/orgs/{organization}/repos",
#             headers=github_headers(token),
#             params={
#                 "type": "all",
#                 "sort": "updated",
#                 "per_page": 100,
#             },
#         )

#     if response.status_code == 401:
#         raise ValueError("GitHub token is invalid or expired")

#     if response.status_code == 403:
#         raise ValueError(
#             "GitHub organization access is not approved"
#         )

#     if response.status_code == 404:
#         raise ValueError(
#             "Organization not found or user does not have access"
#         )

#     response.raise_for_status()

#     return response.json()


# ---------------------------------------------------------
# SHARED REPOSITORIES
# ---------------------------------------------------------

# async def get_shared_repositories(
#     db: AsyncSession,
#     firebase_uid: str,
# ):
#     """
#     Fetch repositories that are shared with the user.

#     This combines:
#       - collaborator repositories
#       - organization repositories

#     User-owned repositories are excluded.
#     """

#     token = await get_github_token(
#         db=db,
#         firebase_uid=firebase_uid,
#     )

#     if not token:
#         return None

#     async with make_client() as client:


#         # 1. Collaborator repositories
#         collaborator_response = await client.get(
#             f"{GITHUB_API_URL}/user/repos",
#             headers=github_headers(token),
#             params={
#                 "affiliation": "collaborator",
#                 "visibility": "all",
#                 "sort": "updated",
#                 "per_page": 100,
#             },
#         )

#         if collaborator_response.status_code == 401:
#             raise ValueError(
#                 "GitHub token is invalid or expired"
#             )

#         collaborator_response.raise_for_status()

#         collaborator_repos = collaborator_response.json()

#         # 2. Organizations
#         org_response = await client.get(
#             f"{GITHUB_API_URL}/user/orgs",
#             headers=github_headers(token),
#             params={
#                 "per_page": 100,
#             },
#         )

#         if org_response.status_code == 401:
#             raise ValueError(
#                 "GitHub token is invalid or expired"
#             )

#         org_response.raise_for_status()

#         organizations = org_response.json()

#         # 3. Fetch organization repositories
#         organization_repos = []

#         for organization in organizations:

#             org_login = organization["login"]

#             response = await client.get(
#                 f"{GITHUB_API_URL}/orgs/{org_login}/repos",
#                 headers=github_headers(token),
#                 params={
#                     "type": "all",
#                     "sort": "updated",
#                     "per_page": 100,
#                 },
#             )

#             # Organization may restrict repository access.
#             if response.status_code in (403, 404):
#                 continue

#             response.raise_for_status()

#             repos = response.json()

#             organization_repos.extend(repos)

#     return {
#         "collaborator_repositories": collaborator_repos,
#         "organization_repositories": organization_repos,
#         "organizations": organizations,
#     }