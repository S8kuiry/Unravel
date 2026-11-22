
import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, field_validator


class LLMConfig(BaseModel):
    """Configuration for selecting and initializing an LLM provider."""

    model_config = ConfigDict(frozen=True)

    provider: str = "groq"

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, value: str) -> str:
        value = value.strip().lower()

        if not value:
            raise ValueError("LLM_PROVIDER cannot be empty")

        supported_providers = ("groq", "openai", "gemini")

        if value not in supported_providers:
            raise ValueError(
                f"Unsupported LLM provider: {value}. "
                f"Supported providers: {', '.join(supported_providers)}"
            )

        return value


@lru_cache(maxsize=1)
def get_llm_config() -> LLMConfig:
    """Load and cache the selected LLM provider."""

    return LLMConfig(
        provider=os.getenv("LLM_PROVIDER", "groq"),
    )
