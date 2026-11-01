
import logging
import inngest

inngest_client = inngest.Inngest(
    app_id="repo-intelligence",
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
