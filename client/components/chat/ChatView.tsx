
"use client";

import { useState } from "react";
import {
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import {
    ArrowLeft,
    Bot,
    Loader2,
    Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/AuthContext";

import {
    createConversation,
    getConversationById,
    sendConversationMessage,
} from "@/api/conversation";

import type {
    MessageResponse,
} from "@/types/conversation";

import MessageList, { type ChatMessage } from "./MessageList";
import ChatComposer from "./ChatComposer";

// ==========================================
// TYPES
// ==========================================

interface ChatViewProps {
    repoId: string;
    repoName: string;
    branch: string;
    conversationId: string | null;
    onBack: () => void;
    onConversationCreated: (id: string) => void;
}

// ==========================================
// COMPONENT
// ==========================================

export default function ChatView({
    repoId,
    repoName,
    branch,
    conversationId,
    onBack,
    onConversationCreated,
}: ChatViewProps) {

    const queryClient = useQueryClient();
    const { getAuthToken } = useAuth();

    const [isSending, setIsSending] = useState(false);
    const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);

    // ======================================
    // FETCH CONVERSATION MESSAGES
    // ======================================

    const {
        data: conversation,
        isLoading,
        isError,
        refetch,
    } = useQuery({
        queryKey: ["conversation", conversationId],

        queryFn: async () => {
            const token = await getAuthToken();

            if (!token) {
                throw new Error("Authentication required");
            }

            return getConversationById(token, conversationId!);
        },

        enabled: Boolean(conversationId),
        staleTime: 60 * 1000,
    });

    // ======================================
    // SEND MESSAGE
    // ======================================

    const handleSend = async (content: string) => {
        if (!content.trim() || isSending) return;

        setIsSending(true);

        const temporaryUserId = crypto.randomUUID();
        const temporaryAgentId = crypto.randomUUID();

        const now = new Date().toISOString();

        // Show optimistic messages immediately
        const optimisticMessages: ChatMessage[] = [
            {
                id: temporaryUserId,
                conversation_id: conversationId ?? "temporary",
                role: "user",
                content,
                created_at: now,
                status: "pending",
            },
            {
                id: temporaryAgentId,
                conversation_id: conversationId ?? "temporary",
                role: "agent",
                content: "",
                created_at: now,
                status: "pending",
            },
        ];

        setLocalMessages((previous) => [
            ...previous,
            ...optimisticMessages,
        ]);

        try {
            const token = await getAuthToken();

            if (!token) {
                throw new Error("Authentication required");
            }

            // Create conversation only when sending the first message
            let activeId = conversationId;

            if (!activeId) {
                const created = await createConversation(token, {
                    repo_id: repoId,
                });

                activeId = created.id;
                onConversationCreated(activeId);
            }

            // Send message to backend
            const response: MessageResponse =
                await sendConversationMessage(token, activeId, {
                    content,
                    branch,
                    role: "user",
                });

            // Remove temporary messages
            setLocalMessages((previous) =>
                previous.filter(
                    (message) =>
                        message.id !== temporaryUserId &&
                        message.id !== temporaryAgentId
                )
            );

            // Refresh conversation messages and history
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: ["conversation", activeId],
                }),
                queryClient.invalidateQueries({
                    queryKey: ["conversations", repoId],
                }),
            ]);

            // If the backend returns only the sent user message,
            // the refreshed conversation query will show it.
            // Otherwise, the returned response is also available here.
            void response;

        } catch (error) {
            console.error("Message sending failed:", error);

            // Keep the user's message visible and mark it as failed
            setLocalMessages((previous) =>
                previous
                    .filter(
                        (message) => message.id !== temporaryAgentId
                    )
                    .map((message) =>
                        message.id === temporaryUserId
                            ? { ...message, status: "error" as const }
                            : message
                    )
            );

            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to send message"
            );

            throw error;

        } finally {
            setIsSending(false);
        }
    };

    // ======================================
    // COMBINE SERVER + LOCAL MESSAGES
    // ======================================

    const messages: ChatMessage[] = [
        ...(conversation?.messages ?? []),
        ...localMessages,
    ];

    // ======================================
    // RENDER
    // ======================================

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#141210] text-[#E8E2D9]">

            {/* Chat Header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-[#302B25] px-3 py-3">

                <button
                    onClick={onBack}
                    className="rounded-md p-1.5 text-[#A39B90] transition hover:bg-[#302820] hover:text-white"
                    title="Back to conversations"
                >
                    <ArrowLeft size={17} />
                </button>

                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#302418]">
                    <Bot size={17} className="text-[#F5A524]" />
                </div>

                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-xs font-semibold">
                        Unravel Assistant
                    </h3>

                    <p className="truncate text-[10px] text-[#827A70]">
                        {repoName} · {branch}
                    </p>
                </div>

                <div className="flex items-center gap-1 rounded-full border border-[#51402A] px-2 py-1">
                    <Sparkles size={10} className="text-[#F5A524]" />
                    <span className="text-[9px] text-[#D6A75F]">
                        Agent
                    </span>
                </div>

            </div>

            {/* Message Area */}
            <div className="min-h-0 flex-1 overflow-hidden">

                {isLoading && conversationId ? (

                    <div className="flex h-full items-center justify-center gap-2 text-xs text-[#A39B90]">
                        <Loader2 size={16} className="animate-spin" />
                        Loading conversation...
                    </div>

                ) : isError && conversationId ? (

                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                        <p className="text-xs text-red-400">
                            Couldn't load this conversation.
                        </p>

                        <button
                            onClick={() => refetch()}
                            className="text-xs text-[#F5A524] hover:underline"
                        >
                            Try again
                        </button>
                    </div>

                ) : (

                    <MessageList
                        messages={messages}
                        isSending={isSending}
                    />

                )}

            </div>

            {/* Composer */}
            <ChatComposer
                onSend={handleSend}
                isSending={isSending}
                disabled={isLoading || (isError && Boolean(conversationId))}
            />

        </div>
    );
}
