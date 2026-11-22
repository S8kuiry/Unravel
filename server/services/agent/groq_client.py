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

    request_args = {
        "model": os.getenv("CHAT_MODEL", "openai/gpt-oss-120b"),
        "messages": messages,
    }

    # Only include tool configuration when tools are provided.
    if tools:
        request_args["tools"] = tools
        request_args["tool_choice"] = tool_choice or "auto"

    # If tools=None, neither tools nor tool_choice is sent.
    response = await client.chat.completions.create(**request_args)

    return response.choices[0].message




async def generate_title(first_message: str) -> str | None:
    """Return a short chat title like ChatGPT/Claude, or None on any failure."""
    try:
        client = await get_groq_client()
        response = await client.chat.completions.create(
            model=os.getenv("TITLE_MODEL", "openai/gpt-oss-120b"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You name chat conversations. Given the user's first "
                        "message, reply with a short title of 2 to 5 words that "
                        "captures the topic. Use title case. No quotes, no "
                        "markdown, no punctuation at the end, no explanation. "
                        "Never answer the message, only title it."
                    ),
                },
                {"role": "user", "content": first_message[:500]},
            ],
            max_tokens=200,
            temperature=0.2,
        )
        title = (response.choices[0].message.content or "").strip()
        title = title.strip("\"'`*#. \n")
        return title[:60] or None
    except Exception as e:
        print("TITLE ERROR:", repr(e))
        return None