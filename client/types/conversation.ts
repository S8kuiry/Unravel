
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

export interface ConversationTitleRequest {
  content: string;
}


// ==========================================
// WEBSOCKET TYPES
// // ==========================================

// export interface ConversationWebSocketRequest {
//   message: string;
//   branch: string;
//   context?: Record<string, unknown>[] | null;
// }

// export interface ConversationWebSocketMessage {
//   id: string;
//   role: "user" | "agent";
//   content: string;
//   created_at: string;
// }

// export interface ConversationWebSocketResponse {
//   type:
//     | "user_message_saved"
//     | "agent_message_saved"
//     | "error";
//   message: ConversationWebSocketMessage | string;
// }

// ==========================================
// CONVERSATION MESSAGE STREAM (SSE) TYPES
// ==========================================

export interface AgentStatusEvent {
  type: "agent_status";
  status: "thinking" | "executing_tool" | "generating_answer";
  tool?: string;
}

export interface AgentTokenEvent {
  type: "agent_token";
  content: string;
}

export interface AgentMessageSavedEvent {
  type: "agent_message_saved";
  message: MessageResponse;
}

export interface AgentErrorEvent {
  type: "error";
  message: string;
}

export type ConversationSSEEvent =
  | AgentStatusEvent
  | AgentTokenEvent
  | AgentMessageSavedEvent
  | AgentErrorEvent;

export interface SendMessageStreamCallbacks {
  onStatus?: (event: AgentStatusEvent) => void;
  onToken?: (content: string) => void;
  onMessageSaved?: (message: MessageResponse) => void;
  onError?: (event: AgentErrorEvent) => void;
  onDone?: () => void;
}

