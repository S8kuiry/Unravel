import json
import math


class TokenCounter:
    def __init__(
        self,
        model: str = "openai/gpt-oss-120b",
        chars_per_token: float = 3.0,
        message_overhead: int = 4,
    ):
        if chars_per_token <= 0:
            raise ValueError("chars_per_token must be greater than 0")

        self.chars_per_token = chars_per_token
        self.message_overhead = message_overhead
        self.encoding = self._load_encoding(model)

    @staticmethod
    def _load_encoding(model: str):
        """Load tiktoken when available; otherwise use the fallback estimate."""
        try:
            import tiktoken

            try:
                return tiktoken.encoding_for_model(model)
            except KeyError:
                return tiktoken.get_encoding("cl100k_base")

        except ImportError:
            return None

    def count_text(self, text: str) -> int:
        """Estimate the token count of a string."""
        if not text:
            return 0

        if self.encoding is not None:
            return len(self.encoding.encode(text))

        return math.ceil(len(text) / self.chars_per_token)

    def count_messages(self, messages: list[dict]) -> int:
        """Estimate tokens used by a list of chat messages."""
        total = 0

        for message in messages:
            message_text = json.dumps(message, ensure_ascii=False)
            total += self.count_text(message_text)
            total += self.message_overhead

        return total

    def count_tools(self, tools: list[dict] | None) -> int:
        """Estimate tokens used by tool definitions."""
        if not tools:
            return 0

        tools_text = json.dumps(tools, ensure_ascii=False)
        return self.count_text(tools_text)

    def count_request(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> int:
        """Estimate the total input tokens for an LLM request."""
        return (
            self.count_messages(messages)
            + self.count_tools(tools)
        )