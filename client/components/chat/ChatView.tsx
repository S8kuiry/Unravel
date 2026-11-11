
"use client";

import { useState } from "react";
import {
    useMutation,
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
    generateConversationTitle,
    getConversationById,
    sendConversationMessage,
} from "@/api/conversation";

import type {
    MessageResponse,
    ConversationDetailResponse,
    ConversationListResponse
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


function makeTitle(text: string, limit = 50) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= limit) return clean;
    return clean.slice(0, limit).replace(/\s+\S*$/, "") + "…";
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

       const generateTitle = useMutation({
        mutationFn: async ({
            conversationId,
            content,
        }: {
            conversationId: string;
            content: string;
        }) => {
            const token = await getAuthToken();
            if (!token) throw new Error("Authentication required");
            return generateConversationTitle(token, conversationId, { content });
        },

        // Quietly patch both caches, no refetch
        onSuccess: (updated) => {
            queryClient.setQueryData<ConversationListResponse>(
                ["conversations", repoId],
                (old) =>
                    old && {
                        ...old,
                        conversations: old.conversations.map((c) =>
                            c.id === updated.id
                                ? { ...c, title: updated.title, updated_at: updated.updated_at }
                                : c
                        ),
                    }
            );

            queryClient.setQueryData<ConversationDetailResponse>(
                ["conversation", updated.id],
                (old) =>
                    old && {
                        ...old,
                        title: updated.title,
                        updated_at: updated.updated_at,
                    }
            );
        },

        // Fallback title stays; nothing to show the user
        onError: () => {},
    });


    const handleSend = async (content: string) => {
        if (!content.trim() || isSending) return;
        setIsSending(true);

        const tempUserId = crypto.randomUUID();
        const tempAgentId = crypto.randomUUID();
        const now = new Date().toISOString();
        let activeId = conversationId;

        try {
            const token = await getAuthToken();
            if (!token) throw new Error("Authentication required");

            if (!activeId) {
                const created = await createConversation(token, {
                    repo_id: repoId,
                    title: makeTitle(content),
                });
                activeId = created.id;
                queryClient.setQueryData<ConversationDetailResponse>(
                    ["conversation", activeId],
                    { ...created, messages: [] }
                );

                generateTitle.mutate({ conversationId: created.id, content });

                // Add the new conversation to the list cache
                queryClient.setQueryData<ConversationListResponse>(
                    ["conversations", repoId],
                    (old) => {
                        if (!old) return old; // list never loaded: let it fetch normally
                        if (old.conversations.some((c) => c.id === created.id)) return old;
                        return {
                            conversations: [created, ...old.conversations],
                            total: old.total + 1,
                        };
                    }
                );
            }

            const key = ["conversation", activeId];

            // 1. Optimistic messages go into the cache
            queryClient.setQueryData<ConversationDetailResponse>(key, (old) => ({
                ...old!,
                messages: [
                    ...(old?.messages ?? []),
                    {
                        id: tempUserId, conversation_id: activeId!, role: "user",
                        content, created_at: now, status: "pending"
                    } as ChatMessage,
                    {
                        id: tempAgentId, conversation_id: activeId!, role: "agent",
                        content: "", created_at: now, status: "pending"
                    } as ChatMessage,
                ],
            }));

            // 2. Switch conversation AFTER the cache is filled
            if (activeId !== conversationId) onConversationCreated(activeId);

            // 3. Get the reply
            const response = await sendConversationMessage(token, activeId, {
                content, branch, role: "user",
            });

            // 4. Replace the pending agent message in place
            queryClient.setQueryData<ConversationDetailResponse>(key, (old) => ({
                ...old!,
                messages: old!.messages.map((m) =>
                    m.id === tempAgentId
                        ? { ...response, status: "completed" }
                        : m.id === tempUserId
                            ? { ...m, status: "completed" }
                            : m
                ),
            }));

            void queryClient.invalidateQueries({ queryKey: ["conversations", repoId] });
        } catch (error) {
            queryClient.setQueryData<ConversationDetailResponse>(
                ["conversation", activeId],
                (old) =>
                    old && {
                        ...old,
                        messages: old.messages
                            .filter((m) => m.id !== tempAgentId)
                            .map((m) =>
                                m.id === tempUserId ? { ...m, status: "error" } : m
                            ),
                    }
            );
            toast.error(error instanceof Error ? error.message : "Failed to send message");
        } finally {
            setIsSending(false);
        }
    };
    // ======================================
    // COMBINE SERVER + LOCAL MESSAGES
    // ======================================

    const messages: ChatMessage[] = conversation?.messages ?? [];

    // ======================================
    // RENDER
    // ======================================

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#141210] text-[#E8E2D9]">

            {/* Chat Header */}
            <div className="flex shrink-0 items-center gap-3  px-3 py-3">

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
                        {conversation?.title ?? "New Conversation"}
                    </h3>

                    <p className="truncate text-[10px] text-[#827A70]">
                        {repoName} · {branch}
                    </p>
                </div>

                {/* <div className="flex items-center gap-1 rounded-full border border-[#51402A] px-2 py-1">
                    <Sparkles size={10} className="text-[#F5A524]" />
                    <span className="text-[9px] text-[#D6A75F]">
                        Agent
                    </span>
                </div> */}

            </div>

            {/* Message Area */}
            <div className="min-h-0 flex-1 overflow-hidden">

                {isLoading && !conversation && localMessages.length === 0 ? (
                    <div className="flex h-full items-center justify-center gap-2 text-xs text-[#A39B90]">
                        <Loader2 size={16} className="animate-spin" />
                        Loading conversation...
                    </div>

                ) : isError && !conversation ? (

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
