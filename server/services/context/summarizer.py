
import logging

from prompts.agent_prompts import (
    CONVERSATION_SUMMARY_PROMPT,
    RESULT_SUMMARY_PROMPT,
)
logger = logging.getLogger(__name__)


class ConversationSummarizer:

    def __init__(self, llm_gateway, config):
        self.llm = llm_gateway
        self.config = config

    async def summarize(
        self,
        messages: list[dict],
        existing_summary: str | None = None,
    ) -> str:

        if not messages:
            return existing_summary or ""

        conversation_text = self._format_messages(messages)

        if existing_summary:
            conversation_text = (
                f"PREVIOUS SUMMARY:\n{existing_summary}\n\n"
                f"NEW MESSAGES:\n{conversation_text}"
            )

        prompt_messages = [
            {
                "role": "system",
                "content": CONVERSATION_SUMMARY_PROMPT,
            },
            {
                "role": "user",
                "content": conversation_text,
            },
        ]

        try:
            response = await self.llm.generate(
                messages=prompt_messages,
                model=self.config.summary_model,
                max_tokens=600,
            )

            summary = getattr(response, "content", None)

            if isinstance(summary, str) and summary.strip():
                return summary.strip()

        except Exception:
            logger.exception("Conversation summarization failed")

        return self._fallback_summary(
            messages,
            existing_summary,
        )

    
    async def result_summarizer(
        self,
        content: str,
        target_tokens: int,
        content_type: str = "general",
    ) -> str:

        if not content:
            return content

        prompt_messages = [
            {
                "role": "system",
                "content": RESULT_SUMMARY_PROMPT,
            },
            {
                "role": "user",
                "content": (
                    f"CONTENT TYPE: {content_type}\n"
                    f"TARGET TOKENS: {target_tokens}\n\n"
                    f"CONTENT:\n{content}"
                ),
            },
        ]

        try:
            response = await self.llm.generate(
                messages=prompt_messages,
                model=self.config.summary_model,
                max_tokens=target_tokens,
            )

            summary = getattr(response, "content", None)

            if isinstance(summary, str) and summary.strip():
                return summary.strip()

        except Exception:
            logger.exception(
                "Result summarization failed for %s",
                content_type,
            )

        # Keep original content if compression fails.
        return content


    @staticmethod
    def _format_messages(messages: list[dict]) -> str:

        formatted = []

        for message in messages:
            role = message.get("role", "unknown")
            content = message.get("content", "")

            if content:
                formatted.append(
                    f"{role.upper()}: {content}"
                )

        return "\n\n".join(formatted)

    @staticmethod
    def _fallback_summary(
        messages: list[dict],
        existing_summary: str | None = None,
    ) -> str:

        new_content = ConversationSummarizer._format_messages(
            messages
        )

        if existing_summary:
            return f"{existing_summary}\n\n{new_content}"

        return new_content
