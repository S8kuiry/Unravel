
import {
  ConversationCreateRequest,
  ConversationResponse,
  ConversationListResponse,
  ConversationDetailResponse,
  ConversationRenameRequest,
  MessageCreateRequest,
  MessageResponse,
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
// SEND MESSAGE
// ==========================================

/**
 * Send a message in a conversation and receive the agent response.
 * Backend: POST /conversations/{conversation_id}/messages
 */
export async function sendConversationMessage(
  token: string,
  conversation_id: string,
  data: MessageCreateRequest
): Promise<MessageResponse> {
  const res = await fetch(
    `${API_BASE_URL}/conversations/${encodeURIComponent(conversation_id)}/messages`,
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
    await handleApiError(res, "Failed to send conversation message.");
  }

  return res.json();
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
