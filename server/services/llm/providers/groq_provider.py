
import os
import asyncio
from itertools import cycle
from typing import Any
from groq import AsyncGroq
from services.llm.config import LLMConfig
from prompts.title_prompts import TITLE_SYSTEM_PROMPT
from dotenv import load_dotenv

load_dotenv()

class GroqProvider:
    """Handles Groq API operations and API key rotation."""

    def __init__(self, config: LLMConfig) -> None:
        self.config = config

        # Provider-specific model selection.
        self.chat_model = os.getenv(
            "CHAT_MODEL",
            "openai/gpt-oss-120b",
        ).strip()

        self.title_model = os.getenv(
            "TITLE_MODEL",
            "openai/gpt-oss-20b",
        ).strip()

        # Provider-specific API settings.
        timeout = float(os.getenv("GROQ_TIMEOUT_SECONDS", "30"))
        max_retries = int(os.getenv("GROQ_MAX_RETRIES", "2"))

        # Load API keys.
        api_keys = [
            os.getenv(f"GROQ_API_KEY_{i}", "").strip()
            for i in range(1, 4)
        ]

        api_keys = [key for key in api_keys if key]

        if not api_keys:
            raise ValueError("No Groq API keys configured")

        # Create a client for each API key.
        self.clients = [
            AsyncGroq(
                api_key=key,
                timeout=timeout,
                max_retries=max_retries,
            )
            for key in api_keys
        ]

        # Round-robin API key rotation.
        self.client_cycle = cycle(self.clients)
        self.client_lock = asyncio.Lock()

    async def get_client(self) -> AsyncGroq:
        """Return the next client in the rotation."""

        async with self.client_lock:
            return next(self.client_cycle)

    async def generate(
        self,
        messages: list[Any],
        model: str | None = None,
        tools: list[Any] | None = None,
        tool_choice: str | None = None,
        **kwargs: Any,
    ) -> Any:
        """Generate a chat completion."""

        client = await self.get_client()

        request_args = {
            "model": model or self.chat_model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 4096,
            **kwargs,
        }

        if tools:
            request_args["tools"] = tools
            request_args["tool_choice"] = tool_choice or "auto"

        response = await client.chat.completions.create(
            **request_args
        )

        return response.choices[0].message

    async def generate_title(
        self,
        first_message: str,
    ) -> str | None:
        """Generate a conversation title."""

        try:
            client = await self.get_client()

            response = await client.chat.completions.create(
                model=self.title_model,
                messages=[
                    {
                        "role": "system",
                        "content": TITLE_SYSTEM_PROMPT,
                    },
                    {
                        "role": "user",
                        "content": first_message[:500],
                    },
                ],
                max_tokens=200,
                temperature=0.2,
            )

            title = (
                response.choices[0].message.content or ""
            ).strip()

            title = title.strip("\"'`*#. \n")

            return title[:60] or None

        except Exception as e:
            print("TITLE ERROR:", repr(e))
            return None
