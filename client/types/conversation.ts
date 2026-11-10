
export interface ConversationCreateRequest {
  repo_id: string;
  title?: string | null;
}

export interface MessageCreateRequest {
  content: string;
  branch: string;
  role?: "user" | "agent";
  context?: Record<string, unknown>[] | null;
}

export interface MessageResponse {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface ConversationResponse {
  id: string;
  repo_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetailResponse extends ConversationResponse {
  messages: MessageResponse[];
}

export interface ConversationListResponse {
  conversations: ConversationResponse[];
  total: number;
}

export interface ConversationRenameRequest {
  title: string;
}


// ==========================================
// WEBSOCKET TYPES
// ==========================================

export interface ConversationWebSocketRequest {
  message: string;
  branch: string;
  context?: Record<string, unknown>[] | null;
}

export interface ConversationWebSocketMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  created_at: string;
}

export interface ConversationWebSocketResponse {
  type:
    | "user_message_saved"
    | "agent_message_saved"
    | "error";
  message: ConversationWebSocketMessage | string;
}

