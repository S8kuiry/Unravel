import inngest
from inngest_worker.inngest_client import inngest_client
from services.indexing_worker import process_index_batch


@inngest_client.create_function(
    fn_id="index-repository-files",
    trigger=[
        inngest.TriggerEvent(event="repo/index.requested"),
        inngest.TriggerCron(cron="* * * * *"),
    ],
    retries=2,
)
async def index_repository_files(ctx: inngest.Context):

    result = await ctx.step.run(
        "process-indexing-batch",
        process_index_batch,
    )

    if result["claimed"] > 0:
        await ctx.step.send_event(
            "continue-indexing",
            inngest.Event(
                name="repo/index.requested",
                data={},
            ),
        )

    return result