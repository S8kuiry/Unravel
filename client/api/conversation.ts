
import {
  ConversationCreateRequest,
  ConversationResponse,
  ConversationListResponse,
  ConversationDetailResponse,
  ConversationRenameRequest,
  MessageCreateRequest,
  MessageResponse,
  ConversationTitleRequest,
  AgentStatusEvent,
  AgentErrorEvent,
  SendMessageStreamCallbacks,
} from "@/types/conversation";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ==========================================
// ERROR HANDLING
// ==========================================

async function handleApiError(
  res: Response,
  fallback: string
): Promise<never> {
  const errorData = await res.json().catch(() => ({}));
  throw new Error(errorData.detail || fallback);
}

// ==========================================
// CREATE CONVERSATION
// ==========================================

/**
 * Create a new conversation for a repository.
 * Backend: POST /conversations/
 */
export async function createConversation(
  token: string,
  data: ConversationCreateRequest
): Promise<ConversationResponse> {
  const res = await fetch(`${API_BASE_URL}/conversations/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    await handleApiError(res, "Failed to create conversation.");
  }

  return res.json();
}

// ==========================================
// GET REPOSITORY CONVERSATIONS
// ==========================================

/**
 * Fetch all conversations belonging to a repository.
 * Backend: GET /conversations/repository/{repo_id}
 */
export async function getRepositoryConversations(
  token: string,
  repo_id: string
): Promise<ConversationListResponse> {
  const res = await fetch(
    `${API_BASE_URL}/conversations/repository/${encodeURIComponent(repo_id)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    await handleApiError(res, "Failed to fetch conversations.");
  }

  return res.json();
}

// ==========================================
// GET CONVERSATION BY ID
// ==========================================

/**
 * Fetch a conversation with its messages.
 * Backend: GET /conversations/{conversation_id}
 */
export async function getConversationById(
  token: string,
  conversation_id: string
): Promise<ConversationDetailResponse> {
  const res = await fetch(
    `${API_BASE_URL}/conversations/${encodeURIComponent(conversation_id)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    await handleApiError(res, "Failed to fetch conversation.");
  }

  return res.json();
}

// ==========================================
// RENAME CONVERSATION
// ==========================================

/**
 * Rename an existing conversation.
 * Backend: PATCH /conversations/{conversation_id}
 */
export async function renameConversation(
  token: string,
  conversation_id: string,
  data: ConversationRenameRequest
): Promise<ConversationResponse> {
  const res = await fetch(
    `${API_BASE_URL}/conversations/${encodeURIComponent(conversation_id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  if (!res.ok) {
    await handleApiError(res, "Failed to rename conversation.");
  }

  return res.json();
}

// ==========================================
// SEND MESSAGE (SSE STREAM)
// ==========================================

/**
 * Send a message in a conversation and stream the agent response via SSE.
 * Backend: POST /conversations/{conversation_id}/messages  (text/event-stream)
 *
 * Backend SSE events are dispatched through callbacks so the UI can render
 * progress and streamed tokens as they arrive. Resolves with the saved agent
 * message once the stream finishes, or null if the stream ended without one.
 */
export async function sendConversationMessage(
  token: string,
  conversation_id: string,
  data: MessageCreateRequest,
  callbacks: SendMessageStreamCallbacks = {}
): Promise<MessageResponse | null> {
  const res = await fetch(
    `${API_BASE_URL}/conversations/${encodeURIComponent(conversation_id)}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to send conversation message.");
  }

  if (!res.body) {
    throw new Error("Streaming is not supported by this response.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalMessage: MessageResponse | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line.
      const events = buffer.split(/\r?\n\r?\n/);

      // Keep the last incomplete event for the next chunk.
      buffer = events.pop() ?? "";

      for (const event of events) {
        if (!event.trim() || event.startsWith(":")) continue;

        const lines = event.split(/\r?\n/);
        let eventData = "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            eventData += line.slice(5).trim();
          }
        }

        if (!eventData) continue;

        try {
          const parsed = JSON.parse(eventData);

          switch (parsed.type) {
            case "agent_status":
              callbacks.onStatus?.(parsed as AgentStatusEvent);
              break;

            case "agent_token":
              callbacks.onToken?.(parsed.content);
              break;

            case "agent_message_saved":
              finalMessage = parsed.message as MessageResponse;
              callbacks.onMessageSaved?.(finalMessage);
              break;

            case "error":
              callbacks.onError?.({
                type: "error",
                message: parsed.message,
              } as AgentErrorEvent);
              break;

            default:
              break;
          }
        } catch {
          console.error("Failed to parse SSE event:", event);
        }
      }
    }
  } finally {
    callbacks.onDone?.();
  }

  return finalMessage;
}

// ==========================================
// DELETE CONVERSATION
// ==========================================

/**
 * Delete a conversation and its associated messages.
 * Backend: DELETE /conversations/{conversation_id}
 */
export async function deleteConversation(
  token: string,
  conversation_id: string
): Promise<{ detail: string }> {
  const res = await fetch(
    `${API_BASE_URL}/conversations/${encodeURIComponent(conversation_id)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    await handleApiError(res, "Failed to delete conversation.");
  }

  return res.json();
}



// ==========================================
// GENERATE CONVERSATION TITLE
// ==========================================

/**
 * Generate an AI title from the first user message.
 * Backend: POST /conversations/{conversation_id}/title
 */
export async function generateConversationTitle(
  token: string,
  conversation_id: string,
  data: ConversationTitleRequest
): Promise<ConversationResponse> {
  const res = await fetch(
    `${API_BASE_URL}/conversations/${encodeURIComponent(conversation_id)}/title`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  if (!res.ok) {
    await handleApiError(res, "Failed to generate conversation title.");
  }

  return res.json();
}

