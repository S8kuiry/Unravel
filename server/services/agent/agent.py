import json
import re
from typing import AsyncGenerator
from uuid import UUID

from groq import APIError as GroqAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from services.llm.gateway import LLMGateway
from tools.definitions import AVAILABLE_TOOLS
from tools.repository_tools import search_repository

llm = LLMGateway()

_REPOSITORY_SEARCH_SIGNALS = (
    r"\b(?:this|the|my|our|current|selected)\s+(?:repo(?:sitory)?|project|codebase|app(?:lication)?)\b",
    r"\b(?:in|from|within|inside)\s+(?:the\s+)?(?:repo(?:sitory)?|project|codebase|code)\b",
    r"\b(?:search|find|locate|look\s+up|show\s+me|trace|inspect)\b.*\b(?:repo(?:sitory)?|code|file|implementation|function|class|module|endpoint)\b",
    r"\b(?:where|which\s+file|what\s+file)\b.*\b(?:implemented|defined|configured|handled|wired|used)\b",
    r"\b(?:file|function|class|method|module|component|endpoint|route|handler|service|schema|model)\s+(?:named|called|defined|implemented)\b",
    r"\b(?:src|app|server|client|lib|components?)/[\w./-]+",
    r"\b[\w.-]+\.(?:py|ts|tsx|js|jsx|go|rs|java|rb|php|cs|cpp|c|sql|json|ya?ml|toml|md)\b",
)

MAX_TOOL_ITERATIONS = 3


def _requires_repository_search(message: str) -> bool:
    normalized = " ".join(message.lower().split())
    return any(re.search(signal, normalized) for signal in _REPOSITORY_SEARCH_SIGNALS)


async def _collect_turn(
    messages: list[dict],
    tools: list | None,
    tool_choice: str | None = None,
) -> tuple[str, list[dict]]:
    """Run one streamed LLM turn without leaking tokens from tool-calling turns."""
    assistant_content = ""
    tool_calls_map: dict[int, dict] = {}

    kwargs: dict = {"messages": messages}
    if tools:
        kwargs["tools"] = tools
        if tool_choice is not None:
            kwargs["tool_choice"] = tool_choice

    async for chunk in llm.generate_stream(**kwargs):
        if chunk["type"] == "content":
            assistant_content += chunk["content"]
        elif chunk["type"] == "tool_call":
            idx = chunk["index"]
            if idx not in tool_calls_map:
                tool_calls_map[idx] = {
                    "id": "",
                    "type": "function",
                    "function": {"name": "", "arguments": ""},
                }
            call = tool_calls_map[idx]
            if chunk.get("id"):
                call["id"] = chunk["id"]
            if chunk.get("name"):
                call["function"]["name"] += chunk["name"]
            if chunk.get("arguments"):
                call["function"]["arguments"] += chunk["arguments"]

    ordered_calls = [tool_calls_map[i] for i in sorted(tool_calls_map)]
    return assistant_content, ordered_calls


async def _collect_turn_safe(
    messages: list[dict],
    tools: list | None,
    tool_choice: str | None = None,
) -> tuple[str, list[dict], bool]:
    """
    Collect a turn safely. If Groq raises 'Tool choice is none, but model called a tool'
    when tools were disabled, re-run with tools enabled so any tool call can be handled
    gracefully instead of crashing the stream.

    Returns (content, ordered_calls, recovered_with_tools).
    """
    try:
        content, ordered_calls = await _collect_turn(
            messages=messages,
            tools=tools,
            tool_choice=tool_choice,
        )
        return content, ordered_calls, False
    except GroqAPIError as exc:
        if "Tool choice is none" not in str(exc) or not AVAILABLE_TOOLS:
            raise

        fallback_messages = [
            *messages,
            {
                "role": "user",
                "content": (
                    "Provide your final answer now using the repository context already gathered. "
                    "Only call search_repository if essential to answer accurately."
                ),
            },
        ]
        content, ordered_calls = await _collect_turn(
            messages=fallback_messages,
            tools=AVAILABLE_TOOLS,
            tool_choice="auto",
        )
        return content, ordered_calls, True


async def _run_tools(
    ordered_calls: list[dict],
    messages: list[dict],
    db: AsyncSession,
    repo_id: UUID,
    branch: str,
) -> AsyncGenerator[dict, None]:
    messages.append({
        "role": "assistant",
        "content": None,
        "tool_calls": ordered_calls,
    })

    for tool_call in ordered_calls:
        tool_name = tool_call["function"]["name"]
        raw_args = tool_call["function"]["arguments"] or "{}"

        try:
            arguments = json.loads(raw_args)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid arguments for tool: {tool_name}") from exc

        yield {
            "type": "agent_status",
            "status": "executing_tool",
            "tool": tool_name,
        }

        if tool_name == "search_repository":
            query = arguments.get("query")
            if not isinstance(query, str) or not query.strip():
                results = {
                    "error": "Invalid repository search query. Please provide a valid search term."
                }
            else:
                results = await search_repository(
                    db=db,
                    repo_id=repo_id,
                    branch=branch,
                    query=query,
                )
        else:
            raise ValueError(f"Unsupported tool: {tool_name}")

        messages.append({
            "role": "tool",
            "tool_call_id": tool_call["id"],
            "name": tool_name,
            "content": json.dumps(results, default=str),
        })


async def run_agent(
    message: str,
    db: AsyncSession,
    repo_id: UUID,
    branch: str,
    context: list | None = None,
) -> AsyncGenerator[dict, None]:
    messages: list[dict] = []

    if context:
        for msg in context:
            role = msg.get("role")
            content = msg.get("content")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": message})

    yield {"type": "agent_status", "status": "thinking"}

    repository_tools = AVAILABLE_TOOLS if _requires_repository_search(message) else None
    iterations = 0
    final_answer = ""

    while True:
        can_call_tools = repository_tools is not None and iterations < MAX_TOOL_ITERATIONS
        content, ordered_calls, recovered = await _collect_turn_safe(
            messages=messages,
            tools=repository_tools if can_call_tools else None,
            tool_choice="auto" if can_call_tools else None,
        )

        # Allow tool execution during normal iterations, or once if recovering from
        # a 'Tool choice is none' error so tool_call_ids aren't left dangling.
        if ordered_calls and (can_call_tools or recovered):
            iterations += 1
            async for event in _run_tools(ordered_calls, messages, db, repo_id, branch):
                yield event
            yield {"type": "agent_status", "status": "generating_answer"}
            continue

        final_answer = content.strip()
        break

    if not final_answer:
        raise RuntimeError("Agent completed without a non-empty answer")

    yield {"type": "agent_token", "content": final_answer}
    yield {"type": "agent_done", "answer": final_answer}