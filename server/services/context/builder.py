
import logging
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.conversation import Conversation, Message
from services.context.config import ContextConfig
from services.context.token_counter import TokenCounter
from services.context.summarizer import ConversationSummarizer


logger = logging.getLogger(__name__)


@dataclass
class ContextResult:
    messages: list[dict]
    input_tokens: int


class ContextBuilder:

    def __init__(
        self,
        token_counter: TokenCounter,
        summarizer: ConversationSummarizer,
        config: ContextConfig,
    ):
        self.token_counter = token_counter
        self.summarizer = summarizer
        self.config = config

    async def _compress_large_results(
        self,
        messages: list[dict],
        available_tokens: int,
    ) -> list[dict]:

        messages = [dict(message) for message in messages]

        total_tokens = self.token_counter.count_messages(messages)

        while total_tokens > available_tokens:

            candidates = [
                (index, message)
                for index, message in enumerate(messages)
                if (
                    message.get("role") in ("tool", "user", "assistant", "system")
                    and isinstance(message.get("content"), str)
                    and len(message["content"]) > 100
                )
            ]

            if not candidates:
                break

            index, largest = max(
                candidates,
                key=lambda item: len(item[1]["content"]),
            )

            content = largest["content"]

            target_tokens = max(
                50,
                self.token_counter.count_text(content) // 2,
            )

            compressed = await self.summarizer.result_summarizer(
                content=content,
                target_tokens=target_tokens,
                content_type=largest.get("role", "general"),
            )

            # Stop if compression did not reduce the content.
            if not compressed or len(compressed) >= len(content):
                break

            messages[index]["content"] = compressed

            total_tokens = self.token_counter.count_messages(messages)

        return messages

    def _manual_truncate(
        self,
        messages: list[dict],
        available_tokens: int,
        tools: list[dict] | None = None,
    ) -> list[dict]:

        messages = [dict(message) for message in messages]

        while self.token_counter.count_request(messages, tools) > available_tokens:

            candidates = [
                (index, message)
                for index, message in enumerate(messages)
                if (
                    index > 0
                    and message.get("role") in ("tool", "assistant", "user")
                    and isinstance(message.get("content"), str)
                    and len(message["content"]) > 100
                )
            ]

            if not candidates:
                break

            index, largest = max(
                candidates,
                key=lambda item: len(item[1]["content"]),
            )

            content = largest["content"]
            new_length = len(content) // 2

            messages[index]["content"] = (
                content[:new_length]
                + "\n...[content truncated because context budget was exceeded]..."
            )

        return messages

    async def build_initial_context(
        self,
        db: AsyncSession,
        conversation_id: UUID,
        current_message_id: UUID,
        current_message: str,
        tools: list[dict] | None = None,
    ) -> ContextResult:

        # Load the conversation.
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id
            )
        )
        conversation = result.scalar_one_or_none()

        if conversation is None:
            raise ValueError("Conversation not found.")

        # Load all previous messages, excluding the current question.
        result = await db.execute(
            select(Message)
            .where(
                Message.conversation_id == conversation_id,
                Message.id != current_message_id,
            )
            .order_by(Message.created_at.asc(), Message.id.asc())
        )
        history = list(result.scalars().all())

        # Update the saved summary when necessary.
        await self._update_summary(
            db=db,
            conversation=conversation,
            history=history,
        )

        # Only messages not already covered by the summary
        # need to be included as original conversation history.
        summarized_count = conversation.summary_message_count or 0
        recent_history = history[summarized_count:]

        messages = []

        if conversation.summary:
            messages.append({
                "role": "system",
                "content": (
                    "SUMMARY OF EARLIER CONVERSATION:\n"
                    + conversation.summary
                ),
            })

        for msg in recent_history:
            if msg.role not in ("user", "agent") or not msg.content:
                continue

            messages.append({
                "role": (
                    "user" if msg.role == "user" else "assistant"
                ),
                "content": msg.content,
            })

        # Always append the current question separately.
        messages.append({
            "role": "user",
            "content": current_message,
        })

        return await self.fit_context(messages, tools)

    async def _update_summary(
        self,
        db: AsyncSession,
        conversation: Conversation,
        history: list[Message],
    ) -> None:

        summarized_count = conversation.summary_message_count or 0
        recent_limit = self.config.recent_limit

        # Keep the latest messages as original conversation history.
        summary_end = max(0, len(history) - recent_limit)

        if summary_end <= summarized_count:
            return

        unsummarized = history[summarized_count:]

        context_messages = [
            {
                "role": "user" if msg.role == "user" else "assistant",
                "content": msg.content,
            }
            for msg in unsummarized
            if msg.role in ("user", "agent") and msg.content
        ]

        current_token_count = (
            self.token_counter.count_text(conversation.summary or "")
            + self.token_counter.count_messages(context_messages)
        )

        if current_token_count <= self.config.summarize_threshold:
            return

        messages_to_summarize = history[
            summarized_count:summary_end
        ]

        summary_input = [
            {
                "role": "user" if msg.role == "user" else "assistant",
                "content": msg.content,
            }
            for msg in messages_to_summarize
            if msg.role in ("user", "agent") and msg.content
        ]

        if not summary_input:
            return

        try:
            new_summary = await self.summarizer.summarize(
                messages=summary_input,
                existing_summary=conversation.summary,
            )

            if not new_summary:
                return

            conversation.summary = new_summary
            conversation.summary_message_count = summary_end

            await db.commit()

            logger.info(
                "Updated summary for conversation %s. "
                "Messages summarized: %s",
                conversation.id,
                summary_end,
            )

        except Exception:
            await db.rollback()
            logger.exception(
                "Failed to summarize conversation %s",
                conversation.id,
            )

    async def fit_context(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> ContextResult:

        messages = [dict(message) for message in messages]

        # Find the latest user question.
        # It may not be the last message because tool results can follow it.
        user_indices = [
            i for i, msg in enumerate(messages)
            if msg.get("role") == "user"
        ]

        if not user_indices:
            raise ValueError("No user question found in context.")

        available_tokens = (
            self.config.input_budget
            - self.config.output_reserve
            - self.config.safety_margin
        )

        def count_tokens():
            return self.token_counter.count_request(
                messages=messages,
                tools=tools,
            )

        total_tokens = count_tokens()

        # Remove oldest complete conversation turns first.
        while total_tokens > available_tokens:

            user_indices = [
                i for i, msg in enumerate(messages)
                if msg.get("role") == "user"
            ]

            # Never remove the latest user turn.
            if len(user_indices) <= 1:
                break

            oldest_turn_start = user_indices[0]
            next_turn_start = user_indices[1]

            del messages[oldest_turn_start:next_turn_start]

            total_tokens = count_tokens()

        # Remove the saved summary if more space is needed.
        if total_tokens > available_tokens:

            messages = [
                msg for i, msg in enumerate(messages)
                if not (
                    i > 0
                    and msg.get("role") == "system"
                    and "SUMMARY OF EARLIER CONVERSATION:"
                    in str(msg.get("content", ""))
                )
            ]

            total_tokens = count_tokens()

        # Try intelligent LLM-based compression first.
        if total_tokens > available_tokens:

            messages = await self._compress_large_results(
                messages=messages,
                available_tokens=available_tokens,
            )

            total_tokens = count_tokens()

        # Use manual truncation only if intelligent compression
        # cannot bring the context within budget.
        if total_tokens > available_tokens:

            messages = self._manual_truncate(
                messages=messages,
                available_tokens=available_tokens,
                tools=tools,
            )

            total_tokens = count_tokens()

        # Never silently send an oversized request.
        if total_tokens > available_tokens:
            raise ValueError(
                "Context exceeds the available token budget."
            )

        return ContextResult(
            messages=messages,
            input_tokens=total_tokens,
        )
