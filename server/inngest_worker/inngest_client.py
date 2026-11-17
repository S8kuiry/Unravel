
import logging
import inngest
import os
from dotenv import load_dotenv
load_dotenv()

inngest_client = inngest.Inngest(
    app_id="repo-intelligence",
    event_key=os.getenv("INNGEST_EVENT_KEY"),
    signing_key=os.getenv("INNGEST_SIGNING_KEY"),
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
