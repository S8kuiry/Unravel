import json
from typing import AsyncGenerator
from uuid import UUID

from groq import APIError as GroqAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from services.llm.gateway import LLMGateway
from tools.definitions import AVAILABLE_TOOLS
from tools.repository_tools import search_repository

llm = LLMGateway()
MAX_TOOL_ITERATIONS = 3


def _is_tool_choice_none_error(exc: GroqAPIError) -> bool:
    combined = f"{exc} {getattr(exc, 'body', '')}".lower()
    return "tool choice is none" in combined


async def _force_direct_answer(messages: list[dict]) -> str:
    """Ask the model to answer directly from existing context without calling tools."""
    nudge_messages = [
        *messages,
        {
            "role": "user",
            "content": (
                "Do not call any tools. Answer directly now using only the "
                "information and context already available."
            ),
        },
    ]
    text = ""
    async for chunk in llm.generate_stream(messages=nudge_messages, tools=None):
        if chunk["type"] == "content":
            text += chunk["content"]
    return text.strip()


async def _collect_turn(
    messages: list[dict],
    tools: list | None,
    *,
    _retried: bool = False,
) -> tuple[str, list[dict]]:
    text = ""
    calls: dict[int, dict] = {}
    kwargs: dict = {"messages": messages}
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
    context: list | None = None,
) -> AsyncGenerator[dict, None]:
    messages = [
        {"role": m["role"], "content": m["content"]}
        for m in (context or [])
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    messages.append({"role": "user", "content": message})

    tools = AVAILABLE_TOOLS or None
    answer = ""

    yield {"type": "agent_status", "status": "thinking"}

    for _ in range(MAX_TOOL_ITERATIONS):
        text, tool_calls = await _collect_turn(messages, tools)
        if not tool_calls:
            answer = text.strip()
            break

        messages.append({"role": "assistant", "content": None, "tool_calls": tool_calls})
        for call in tool_calls:
            name = call["function"]["name"]
            yield {"type": "agent_status", "status": "executing_tool", "tool": name}
            output = await _call_tool(name, call["function"]["arguments"], db, repo_id, branch)
            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "name": name,
                "content": output,
            })
        yield {"type": "agent_status", "status": "generating_answer"}

    if not answer:
        try:
            answer = await _force_direct_answer(messages)
        except GroqAPIError as exc:
            if not _is_tool_choice_none_error(exc):
                raise
            answer = ""

    if not answer:
        raise RuntimeError("Agent completed without a non-empty answer")

    yield {"type": "agent_token", "content": answer}
    yield {"type": "agent_done", "answer": answer}