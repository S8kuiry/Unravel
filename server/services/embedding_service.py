
import asyncio
import logging
import os

from google import genai
from google.genai import types


logger = logging.getLogger(__name__)

MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-2")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "768"))

# One client per API key, reused across requests.
_clients = {}
_next_key_index = 0
_key_lock = asyncio.Lock()


def _load_api_keys() -> list[str]:
    """Load configured API keys in their intended order."""
    keys = [
        os.getenv("EMBEDDING_API_KEY_1"),
        os.getenv("EMBEDDING_API_KEY_2"),
        os.getenv("EMBEDDING_API_KEY_3"),
    ]

    return [key.strip() for key in keys if key and key.strip()]


async def _get_next_key_index(key_count: int) -> int:
    global _next_key_index

    async with _key_lock:
        index = _next_key_index % key_count
        return index


async def _set_next_key_index(index: int, key_count: int):
    global _next_key_index

    async with _key_lock:
        _next_key_index = (index + 1) % key_count


def _get_client(api_key: str):
    """Reuse the SDK client for this key."""
    if api_key not in _clients:
        _clients[api_key] = genai.Client(api_key=api_key)

    return _clients[api_key]


def _generate_embedding(client, contents) -> list[float]:
    """Synchronous SDK call; run it outside the async event loop."""
    response = client.models.embed_content(
        model=MODEL,
        contents=contents,
        config=types.EmbedContentConfig(
            output_dimensionality=EMBEDDING_DIM
        ),
    )

    if not response.embeddings:
        raise RuntimeError("Gemini returned no embeddings")

    vector = response.embeddings[0].values

    if not vector or len(vector) != EMBEDDING_DIM:
        raise RuntimeError(
            f"Expected {EMBEDDING_DIM} dimensions, "
            f"received {len(vector) if vector else 0}"
        )

    return list(vector)


def _should_try_next_key(error: Exception) -> bool:
    """
    Rotate keys for quota, authentication, server, and
    transient failures. Do not retry malformed requests.
    """
    status = (
        getattr(error, "code", None)
        or getattr(error, "status_code", None)
    )

    # A malformed request will fail with every key.
    if status == 400:
        return False

    return True


async def _embed(contents) -> list[float]:
    keys = _load_api_keys()

    if not keys:
        raise RuntimeError(
            "No embedding API keys configured. "
            "Set EMBEDDING_API_KEY_1, _2, or _3."
        )

    start_index = await _get_next_key_index(len(keys))
    last_error = None

    # Try each configured key at most once per request.
    for attempt in range(len(keys)):
        index = (start_index + attempt) % len(keys)
        api_key = keys[index]

        try:
            client = _get_client(api_key)

            vector = await asyncio.to_thread(
                _generate_embedding,
                client,
                contents,
            )

            # Next request starts with the next key.
            await _set_next_key_index(index, len(keys))

            return vector

        except Exception as error:
            last_error = error

            if not _should_try_next_key(error):
                raise

            logger.warning(
                "Embedding request failed with key slot %s; "
                "trying the next configured key. Error: %s",
                index + 1,
                type(error).__name__,
            )

    raise RuntimeError(
        f"Embedding failed with all {len(keys)} configured API keys"
    ) from last_error


async def embed_code_chunk(
    content: str,
    title: str | None = None,
) -> list[float]:
    """
    Embed one repository code chunk for code retrieval.
    """
    if not content or not content.strip():
        raise ValueError("Cannot embed empty code content")

    document = (
        f"title: {title or 'none'} | "
        f"text: {content}"
    )

    return await _embed(
        f"task: code retrieval | {document}"
    )


async def embed_search_query(query: str) -> list[float]:
    """
    Embed a user's natural-language repository search query.
    """
    if not query or not query.strip():
        raise ValueError("Cannot embed an empty search query")

    return await _embed(
        f"task: code retrieval | query: {query}"
    )


async def embed_image(
    image_bytes: bytes,
    mime_type: str,
) -> list[float]:
    """
    Embed an image into the same multimodal vector space.
    Supported image MIME types include PNG and JPEG.
    """
    if not image_bytes:
        raise ValueError("Image data is empty")

    if mime_type not in {"image/png", "image/jpeg"}:
        raise ValueError("Only PNG and JPEG images are supported")

    image_part = types.Part.from_bytes(
        data=image_bytes,
        mime_type=mime_type,
    )

    return await _embed([image_part])
