
import json

from uuid import UUID
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from services.llm.gateway import LLMGateway
from tools.definitions import AVAILABLE_TOOLS
from tools.repository_tools import search_repository

# Initialize the gateway once, not on every user request.
llm = LLMGateway()


async def run_agent(
    message: str,
    db: AsyncSession,
    repo_id: UUID,
    branch: str,
    context: list | None = None,
) -> AsyncGenerator[dict, None]:

    # 1. Prepare conversation messages.
    # The provider adds AGENT_SYSTEM_PROMPT automatically.
    messages = []

    if context:
        for msg in context:
            role = msg.get("role")
            content = msg.get("content")

            if role in ("user", "assistant") and content:
                messages.append({
                    "role": role,
                    "content": content,
                })

    messages.append({
        "role": "user",
        "content": message,
    })

    # 2. Request the initial streamed response.
    yield {
        "type": "agent_status",
        "status": "thinking",
    }

    tool_calls = {}
    assistant_content = ""

    async for chunk in llm.generate_stream(
        messages=messages,
        tools=AVAILABLE_TOOLS,
    ):

        if chunk["type"] == "content":
            content = chunk["content"]
            assistant_content += content

            yield {
                "type": "agent_token",
                "content": content,
            }

        elif chunk["type"] == "tool_call":
            index = chunk["index"]

            if index not in tool_calls:
                tool_calls[index] = {
                    "id": "",
                    "type": "function",
                    "function": {
                        "name": "",
                        "arguments": "",
                    },
                }

            call = tool_calls[index]

            if chunk.get("id"):
                call["id"] = chunk["id"]

            if chunk.get("name"):
                call["function"]["name"] += chunk["name"]

            if chunk.get("arguments"):
                call["function"]["arguments"] += chunk["arguments"]

    # 3. No tool requested: the streamed answer is complete.
    if not tool_calls:
        yield {
            "type": "agent_done",
            "answer": assistant_content,
        }
        return

    # 4. Reconstruct the complete assistant tool-call message.
    ordered_calls = [
        tool_calls[index]
        for index in sorted(tool_calls)
    ]

    assistant_message = {
        "role": "assistant",
        "content": assistant_content or None,
        "tool_calls": ordered_calls,
    }

    messages.append(assistant_message)

    # 5. Execute the requested tools sequentially.
    for tool_call in ordered_calls:

        tool_name = tool_call["function"]["name"]

        try:
            arguments = json.loads(
                tool_call["function"]["arguments"]
            )
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Invalid arguments for tool: {tool_name}"
            ) from exc

        yield {
            "type": "agent_status",
            "status": "executing_tool",
            "tool": tool_name,
        }

        if tool_name == "search_repository":

            query = arguments.get("query")

            if not isinstance(query, str) or not query.strip():
                raise ValueError(
                    "Invalid repository search query"
                )

            results = await search_repository(
                db=db,
                repo_id=repo_id,
                branch=branch,
                query=query,
            )

        else:
            raise ValueError(
                f"Unsupported tool: {tool_name}"
            )

        # 6. Connect the result to its exact tool call.
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call["id"],
            "name": tool_name,
            "content": json.dumps(results, default=str),
        })

    # 7. Generate and stream the final answer.
    yield {
        "type": "agent_status",
        "status": "generating_answer",
    }

    final_answer = ""

    async for chunk in llm.generate_stream(
        messages=messages,
        tools=None,
    ):

        if chunk["type"] == "content":
            final_answer += chunk["content"]

            yield {
                "type": "agent_token",
                "content": chunk["content"],
            }

    yield {
        "type": "agent_done",
        "answer": final_answer,
    }
