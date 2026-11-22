import logging
import os
import inngest
from dotenv import load_dotenv

# Load local development overrides first. `.env.local` is local-only and is never
# deployed, so in production this is a no-op and the real Inngest keys come from
# `.env` / the environment. `override=True` lets `.env.local` win locally; the
# `.env` load below does not override, so it only fills in what is still unset.
# `server/` directory (one level up from this file), where .env / .env.local live.
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(dotenv_path=os.path.join(_root, ".env.local"), override=True)
load_dotenv(dotenv_path=os.path.join(_root, ".env"))

is_dev = os.getenv("INNGEST_DEV", "").lower() in ("1", "true", "yes")

# In development (Inngest Dev Server) never feed production keys to the client.
# The SDK falls back to its own dev-server event key when no event key is set and
# no signing key is needed locally. This avoids:
#   * "non-hexadecimal number found in fromhex()" on production signing keys, and
#   * "Sync rejected since it's from a Dev Server but expected Cloud".
if is_dev:
    for key in ("INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"):
        os.environ.pop(key, None)

event_key = os.getenv("INNGEST_EVENT_KEY")
signing_key = os.getenv("INNGEST_SIGNING_KEY") or None

inngest_client = inngest.Inngest(
    app_id="repo-intelligence",
    event_key=event_key,
    signing_key=signing_key,
    is_production=not is_dev,
    logger=logging.getLogger("uvicorn"),
)


async def send_indexing_event(repo_id, branch: str):
    return await inngest_client.send(
        inngest.Event(
            name="repo/index.requested",
            data={
                "repo_id": str(repo_id),
                "branch": branch,
            },
        )
    )