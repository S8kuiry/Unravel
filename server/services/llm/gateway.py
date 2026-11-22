
from typing import Any,AsyncGenerator

from services.llm.config import LLMConfig, get_llm_config
from services.llm.providers.groq_provider import GroqProvider


class LLMGateway:
    """Routes LLM operations to the selected provider."""

    def __init__(self, config: LLMConfig | None = None) -> None:
        self.config = config or get_llm_config()

        # Initialize the selected provider.
        if self.config.provider == "groq":
            self.provider = GroqProvider(self.config)
        else:
            raise ValueError(
                f"Provider not implemented: {self.config.provider}"
            )

    async def generate(
        self,
        messages: list[Any],
        model: str | None = None,
        tools: list[Any] | None = None,
        tool_choice: str | None = None,
        **kwargs: Any,
    ) -> Any:
        """Forward generation requests to the provider."""

        return await self.provider.generate(
            messages=messages,
            model=model,
            tools=tools,
            tool_choice=tool_choice,
            **kwargs,
        )
    

    async def generate_stream(
    self,
    messages: list[Any],
    model: str | None = None,
    tools: list[Any] | None = None,
    tool_choice: str | None = None,
    **kwargs: Any,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Forward streaming chat completions to the active provider."""
        async for chunk in self.provider.generate_stream(
        messages=messages,
        model=model,
        tools=tools,
        tool_choice=tool_choice,
        **kwargs,
        ):
            
            yield chunk
            


    async def generate_title(
        self,
        first_message: str,
    ) -> str | None:
        """Forward title generation requests to the provider."""

        return await self.provider.generate_title(first_message)
