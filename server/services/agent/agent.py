import json
from typing import AsyncGenerator
from uuid import UUID

from groq import APIError as GroqAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from services.llm.gateway import LLMGateway
from tools.definitions import AVAILABLE_TOOLS
from tools.repository_tools import search_repository
from services.context.builder import ContextBuilder
from services.context.config import ContextConfig
from services.context.token_counter import TokenCounter
from services.context.summarizer import ConversationSummarizer

llm = LLMGateway()
MAX_TOOL_ITERATIONS = 3


def _is_tool_choice_none_error(exc: GroqAPIError) -> bool:
    combined = f"{exc} {getattr(exc, 'body', '')}".lower()
    return "tool choice is none" in combined


async def _force_direct_answer(messages: list[dict], max_tokens: int = 4096) -> str:
    """Ask the model to answer directly without calling tools."""

    nudge_messages = [
        *messages,
        {
            "role": "user",
            "content": (
                "Do not call any tools. Answer directly using only "
                "the information and context already available."
            ),
        },
    ]

    text = ""
    try:
        async for chunk in llm.generate_stream(
            messages=nudge_messages,
            tools=None,
            max_tokens=max_tokens,
        ):
            if chunk["type"] == "content":
                text += chunk["content"]
    except GroqAPIError as exc:
        if not _is_tool_choice_none_error(exc):
            raise
        # If tool/tool_call messages are confusing the model, retry with plain text turns only.
        plain_messages = [
            m for m in messages
            if m.get("role") in ("user", "assistant") and m.get("content")
        ]
        plain_messages.append({
            "role": "user",
            "content": "Answer directly in plain text only using what you already know.",
        })
        async for chunk in llm.generate_stream(
            messages=plain_messages,
            tools=None,
            max_tokens=max_tokens,
        ):
            if chunk["type"] == "content":
                text += chunk["content"]

    return text.strip()


async def _collect_turn(
    messages: list[dict],
    tools: list | None,
    *,
    max_tokens: int = 4096,
    _retried: bool = False,
) -> tuple[str, list[dict]]:
    text = ""
    calls: dict[int, dict] = {}
    kwargs: dict = {"messages": messages, "max_tokens": max_tokens}
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    try:
        async for chunk in llm.generate_stream(**kwargs):
            if chunk["type"] == "content":
                text += chunk["content"]
            elif chunk["type"] == "tool_call":
                c = calls.setdefault(
                    chunk["index"],
                    {"id": "", "type": "function", "function": {"name": "", "arguments": ""}},
                )
                if chunk.get("id"):
                    c["id"] = chunk["id"]
                if chunk.get("name"):
                    c["function"]["name"] += chunk["name"]
                if chunk.get("arguments"):
                    c["function"]["arguments"] += chunk["arguments"]
    except GroqAPIError as exc:
        if _is_tool_choice_none_error(exc) and not _retried and AVAILABLE_TOOLS:
            return await _collect_turn(messages, AVAILABLE_TOOLS, _retried=True)
        if _is_tool_choice_none_error(exc):
            forced = await _force_direct_answer(messages)
            return forced, []
        raise

    return text, [calls[i] for i in sorted(calls)]


async def _call_tool(name: str, raw_args: str, db: AsyncSession, repo_id: UUID, branch: str) -> str:
    try:
        args = json.loads(raw_args or "{}")
    except json.JSONDecodeError:
        return json.dumps({"error": f"Invalid arguments for {name}"})

    # Add future tools as elif branches here.
    if name == "search_repository":
        query = (args.get("query") or "").strip()
        if not query:
            return json.dumps({"error": "Empty search query"})
        res = await search_repository(db=db, repo_id=repo_id, branch=branch, query=query)
        return json.dumps(res, default=str)

    raise ValueError(f"Unsupported tool: {name}")


async def run_agent(
    message: str,
    db: AsyncSession,
    repo_id: UUID,
    branch: str,
    conversation_id: UUID,
    user_message_id: UUID,
) -> AsyncGenerator[dict, None]:

    # Initialize context services.
    context_config = ContextConfig.from_env()

    token_counter = TokenCounter(
        chars_per_token=context_config.chars_per_token,
        message_overhead=context_config.message_overhead,
    )

    summarizer = ConversationSummarizer(
        llm_gateway=llm,
        config=context_config,
    )

    context_builder = ContextBuilder(
        token_counter=token_counter,
        summarizer=summarizer,
        config=context_config,
    )

    tools = AVAILABLE_TOOLS or None
    answer = ""

    yield {"type": "agent_status", "status": "thinking"}

    # Load conversation history and build the initial context.
    context_result = await context_builder.build_initial_context(
        db=db,
        conversation_id=conversation_id,
        current_message_id=user_message_id,
        current_message=message,
        tools=tools,
    )

    messages = context_result.messages

    for _ in range(MAX_TOOL_ITERATIONS):

        # Recheck context before every LLM request.
        context_result = await context_builder.fit_context(
            messages=messages,
            tools=tools,
        )

        messages = context_result.messages

        text, tool_calls = await _collect_turn(
            messages, tools, max_tokens=context_config.output_reserve
        )

        if not tool_calls:
            answer = text.strip()
            break

        messages.append({
            "role": "assistant",
            "content": None,
            "tool_calls": tool_calls,
        })

        for call in tool_calls:
            name = call["function"]["name"]

            yield {
                "type": "agent_status",
                "status": "executing_tool",
                "tool": name,
            }

            output = await _call_tool(
                name,
                call["function"]["arguments"],
                db,
                repo_id,
                branch,
            )

            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "name": name,
                "content": output,
            })

        yield {
            "type": "agent_status",
            "status": "generating_answer",
        }

    if not answer:
        # Fit context again before the direct-answer request.
        context_result = await context_builder.fit_context(
            messages=messages,
            tools=None,
        )

        messages = context_result.messages

        answer = await _force_direct_answer(messages, max_tokens=context_config.output_reserve)

    if not answer:
        raise RuntimeError(
            "Agent completed without a non-empty answer"
        )

    yield {"type": "agent_token", "content": answer}
    yield {"type": "agent_done", "answer": answer}