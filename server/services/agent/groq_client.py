import os
import asyncio

from itertools import cycle
from groq import AsyncGroq


api_keys = [
    os.getenv("GROQ_API_KEY_1"),
    os.getenv("GROQ_API_KEY_2"),
    os.getenv("GROQ_API_KEY_3"),
]

api_keys = [key for key in api_keys if key]

if not api_keys:
    raise ValueError("No Groq API keys configured")


clients = [AsyncGroq(api_key=key) for key in api_keys]

client_cycle = cycle(clients)
client_lock = asyncio.Lock()


async def get_groq_client():
    async with client_lock:
        return next(client_cycle)

async def generate_response(
    messages: list,
    tools: list | None = None,
    tool_choice: str | None = None,
):
    client = await get_groq_client()

    # Explicitly determine tool choice
    if tool_choice is not None:
        resolved_tool_choice = tool_choice
    else:
        resolved_tool_choice = "auto" if tools else "none"

    response = await client.chat.completions.create(
        model=os.getenv("CHAT_MODEL", "openai/gpt-oss-120b"),
        messages=messages,
        tools=tools,
        tool_choice=resolved_tool_choice,
    )

    return response.choices[0].message