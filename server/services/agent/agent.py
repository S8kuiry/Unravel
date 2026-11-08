import json

from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from services.agent.groq_client import generate_response
from tools.definitions import AVAILABLE_TOOLS
from tools.repository_tools import search_repository


async def run_agent(
    message: str,
    db: AsyncSession,
    repo_id: UUID,
    branch: str,
    context: list | None = None
) -> str:

    # 1. System Prompt always comes first
    messages = [
        {
            "role": "system",
            "content": """
            You are UNRAVEL, an AI repository assistant.

            You can answer general questions naturally.

            When a question requires information from the
            user's repository, use the search_repository tool.

            Only make one tool call at a time.
            Do not invent repository information.
            """
        }
    ]

    # 2. Append past conversation history (context) if provided
    # 2. Append past conversation history (context) safely
    if context:
        for msg in context:
            role = msg.get("role")
            content = msg.get("content")
            
            # Only allow standard roles with actual text to prevent 400 schema errors
            if role in ("user", "assistant") and content:
                messages.append({
                    "role": role,
                    "content": content
                })
    # 3. Append the current user message
    messages.append({
        "role": "user",
        "content": message,
    })

    # 4. Ask Groq what to do
    response = await generate_response(
        messages=messages,
        tools=AVAILABLE_TOOLS,
    )

    # No tool requested: return natural answer
    if not response.tool_calls:
        return response.content or ""

    # Get the requested tool
    tool_call = response.tool_calls[0]
    tool_name = tool_call.function.name
    arguments = json.loads(tool_call.function.arguments)

    # Execute only tools explicitly allowed by our backend
    if tool_name == "search_repository":
        query = arguments.get("query")

        if not isinstance(query, str) or not query.strip():
            raise ValueError("Invalid repository search query")

        results = await search_repository(
            db=db,
            repo_id=repo_id,
            branch=branch,
            query=query,
        )
    else:
        raise ValueError(f"Unsupported tool: {tool_name}")

    # Add Groq's tool-call message to conversation.
    # Strip tool_calls so the assistant message is text-only.
    assistant_msg = response.model_dump(exclude_none=True)
    assistant_msg.pop("tool_calls", None)
    messages.append(assistant_msg)

    # Send the tool result back as text in a user message.
    # Using 'user' role (instead of 'tool') avoids Groq Harmony's
    # strict tool-naming requirements for the 'tool' role.
    messages.append({
        "role": "user",
        "content": f"Tool results from search_repository:\n{json.dumps(results)}\n\nPlease answer the user's question based on these results.",
    })

    # 5. Ask Groq to generate the final answer (no tools, text only).
    final_response = await generate_response(
        messages=messages,
        tools=None,
    )

    return final_response.content or ""