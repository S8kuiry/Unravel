import os
from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field, model_validator

load_dotenv()
class ContextConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    # Context token budget
    input_budget: int = Field(default=6000, gt=0)
    output_reserve: int = Field(default=1000, gt=0)
    safety_margin: int = Field(default=500, ge=0)

    # Conversation history
    recent_limit: int = Field(default=6, gt=0)
    summarize_threshold: int = Field(default=4000, gt=0)
    summary_model: str = "openai/gpt-oss-20b"

    # Token estimation fallback
    chars_per_token: float = Field(default=3.0, gt=0)
    message_overhead: int = Field(default=4, ge=0)

    @model_validator(mode="after")
    def validate_budget(self):
        if self.output_reserve + self.safety_margin >= self.input_budget:
            raise ValueError(
                "Output reserve and safety margin must be "
                "smaller than the input budget."
            )

        return self

    @classmethod
    def from_env(cls):
        """Load context settings from environment variables."""
        return cls(
            input_budget=int(
                os.getenv("CONTEXT_INPUT_BUDGET", "6000")
            ),
            output_reserve=int(
                os.getenv("CONTEXT_OUTPUT_RESERVE", "1000")
            ),
            safety_margin=int(
                os.getenv("CONTEXT_SAFETY_MARGIN", "500")
            ),
            recent_limit=int(
                os.getenv("CONTEXT_RECENT_LIMIT", "6")
            ),
            summarize_threshold=int(
                os.getenv("CONTEXT_SUMMARIZE_THRESHOLD", "4000")
            ),
            summary_model=os.getenv(
                "CONTEXT_SUMMARY_MODEL",
                "openai/gpt-oss-20b",
            ),
            chars_per_token=float(
                os.getenv("TOKEN_CHARS_PER_TOKEN", "3.0")
            ),
            message_overhead=int(
                os.getenv("TOKEN_MESSAGE_OVERHEAD", "4")
            ),
        )