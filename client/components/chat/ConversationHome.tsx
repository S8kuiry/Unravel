
"use client";

import { useState } from "react";
import {
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import {
    MessageSquare,
    Plus,
    Pencil,
    Trash2,
    Check,
    X,
    Loader2,
    MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/AuthContext";
import {
    getRepositoryConversations,
    renameConversation,
    deleteConversation,
} from "@/api/conversation";

import type { ConversationResponse } from "@/types/conversation";

// ==========================================
// TYPES
// ==========================================

interface ConversationHomeProps {
    repoId: string;
    repoName: string;
    onNewConversation: () => void;
    onOpenConversation: (id: string) => void;
}

// ==========================================
// HELPERS
// ==========================================

function formatDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();

    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return "Today";
    }

    if (days === 1) {
        return "Yesterday";
    }

    if (days < 7) {
        return `${days} days ago`;
    }

    return date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year:
            date.getFullYear() !== now.getFullYear()
                ? "numeric"
                : undefined,
    });
}

// ==========================================
// COMPONENT
// ==========================================

export default function ConversationHome({
    repoId,
    repoName,
    onNewConversation,
    onOpenConversation,
}: ConversationHomeProps) {

    const queryClient = useQueryClient();
    const { getAuthToken } = useAuth();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState("");
    const [showDeleteId, setShowDeleteId] = useState<string | null>(null);

    const queryKey = ["conversations", repoId];

    // ======================================
    // FETCH CONVERSATIONS
    // ======================================

    const {
        data,
        isLoading,
        isError,
        refetch,
    } = useQuery({
        queryKey,
        queryFn: async () => {
            const token = await getAuthToken();

            if (!token) {
                throw new Error("Authentication required");
            }

            return getRepositoryConversations(token, repoId);
        },
        enabled: Boolean(repoId),
        staleTime: 30 * 1000,
    });

    const conversations = data?.conversations ?? [];

    // ======================================
    // RENAME CONVERSATION
    // ======================================

    const renameMutation = useMutation({
        mutationFn: async ({
            id,
            title,
        }: {
            id: string;
            title: string;
        }) => {
            const token = await getAuthToken();

            if (!token) {
                throw new Error("Authentication required");
            }

            return renameConversation(token, id, { title });
        },

        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
            toast.success("Conversation renamed");
            setEditingId(null);
            setEditingTitle("");
        },

        onError: (error: Error) => {
            toast.error(error.message || "Failed to rename conversation");
        },
    });

    const handleRename = (conversation: ConversationResponse) => {
        const title = editingTitle.trim();

        if (!title) {
            toast.error("Title cannot be empty");
            return;
        }

        if (title === conversation.title) {
            setEditingId(null);
            return;
        }

        renameMutation.mutate({
            id: conversation.id,
            title,
        });
    };

    // ======================================
    // DELETE CONVERSATION
    // ======================================

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const token = await getAuthToken();

            if (!token) {
                throw new Error("Authentication required");
            }

            return deleteConversation(token, id);
        },

        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
            toast.success("Conversation deleted");
            setShowDeleteId(null);
        },

        onError: (error: Error) => {
            toast.error(error.message || "Failed to delete conversation");
        },
    });

    // ======================================
    // RENDER
    // ======================================

    return (
        <div className="flex h-full min-h-0 flex-col text-[#E8E2D9]">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#302B25] px-3 py-3">

                <div className="min-w-0">
                    <h3 className="text-sm font-semibold">
                        Conversations
                    </h3>

                    <p className="mt-0.5 truncate text-[11px] text-[#8F877C]">
                        {repoName}
                    </p>
                </div>

                <button
                    onClick={onNewConversation}
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#F5A524] px-2.5 py-2 text-xs font-semibold text-[#17130D] transition hover:bg-[#FFB83F]"
                >
                    <Plus size={14} />
                    New
                </button>
            </div>

            {/* Conversation List */}
            <div className="min-h-0 flex-1 overflow-y-auto p-2">

                {/* Loading */}
                {isLoading && (
                    <div className="flex h-32 items-center justify-center gap-2 text-xs text-[#A39B90]">
                        <Loader2 size={16} className="animate-spin" />
                        Loading conversations...
                    </div>
                )}

                {/* Error */}
                {isError && !isLoading && (
                    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                        <p className="text-xs text-red-400">
                            Failed to load conversations.
                        </p>

                        <button
                            onClick={() => refetch()}
                            className="text-xs text-[#F5A524] hover:underline"
                        >
                            Try again
                        </button>
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && !isError && conversations.length === 0 && (
                    <div className="flex h-full min-h-48 flex-col items-center justify-center px-5 text-center">

                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#25211C]">
                            <MessageCircle
                                size={22}
                                className="text-[#F5A524]"
                            />
                        </div>

                        <h4 className="text-sm font-medium">
                            No conversations yet
                        </h4>

                        <p className="mt-1 text-xs leading-relaxed text-[#8F877C]">
                            Start a conversation with your repository assistant.
                        </p>

                        <button
                            onClick={onNewConversation}
                            className="mt-4 flex items-center gap-1.5 rounded-md border border-[#51402A] px-3 py-2 text-xs text-[#F5A524] transition hover:bg-[#2A2319]"
                        >
                            <Plus size={14} />
                            Start a conversation
                        </button>
                    </div>
                )}

                {/* Conversation Items */}
                {!isLoading && !isError && conversations.length > 0 && (
                    <div className="space-y-1">

                        {conversations.map((conversation) => (
                            <div
                                key={conversation.id}
                                className="group rounded-lg border border-transparent p-2.5 transition hover:border-[#393127] hover:bg-[#201C17]"
                            >

                                {editingId === conversation.id ? (

                                    /* Rename Mode */
                                    <div className="space-y-2">

                                        <input
                                            autoFocus
                                            value={editingTitle}
                                            onChange={(e) =>
                                                setEditingTitle(e.target.value)
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    handleRename(conversation);
                                                }

                                                if (e.key === "Escape") {
                                                    setEditingId(null);
                                                }
                                            }}
                                            className="w-full rounded-md border border-[#51402A] bg-[#171410] px-2 py-1.5 text-xs text-[#E8E2D9] outline-none focus:border-[#F5A524]"
                                        />

                                        <div className="flex justify-end gap-2">

                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="rounded p-1 text-[#8F877C] hover:text-white"
                                                title="Cancel"
                                            >
                                                <X size={14} />
                                            </button>

                                            <button
                                                onClick={() => handleRename(conversation)}
                                                disabled={renameMutation.isPending}
                                                className="rounded p-1 text-[#F5A524] hover:text-[#FFB83F] disabled:opacity-50"
                                                title="Save"
                                            >
                                                {renameMutation.isPending ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <Check size={14} />
                                                )}
                                            </button>

                                        </div>
                                    </div>

                                ) : (

                                    /* Normal Mode */
                                    <div className="flex items-start gap-2">

                                        <button
                                            onClick={() =>
                                                onOpenConversation(conversation.id)
                                            }
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <div className="flex items-center gap-2">
                                                <MessageSquare
                                                    size={13}
                                                    className="shrink-0 text-[#F5A524]"
                                                />

                                                <span className="truncate text-xs font-medium text-[#E8E2D9]">
                                                    {conversation.title || "New conversation"}
                                                </span>
                                            </div>

                                            <p className="mt-1 pl-5 text-[10px] text-[#827A70]">
                                                {formatDate(conversation.updated_at)}
                                            </p>
                                        </button>

                                        {/* Actions */}
                                        <div className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">

                                            <button
                                                onClick={() => {
                                                    setEditingId(conversation.id);
                                                    setEditingTitle(conversation.title || "");
                                                }}
                                                className="rounded p-1.5 text-[#827A70] hover:bg-[#342C22] hover:text-[#F5A524]"
                                                title="Rename"
                                            >
                                                <Pencil size={13} />
                                            </button>

                                            <button
                                                onClick={() =>
                                                    setShowDeleteId(
                                                        showDeleteId === conversation.id
                                                            ? null
                                                            : conversation.id
                                                    )
                                                }
                                                className="rounded p-1.5 text-[#827A70] hover:bg-[#34221F] hover:text-red-400"
                                                title="Delete"
                                            >
                                                <Trash2 size={13} />
                                            </button>

                                        </div>
                                    </div>
                                )}

                                {/* Delete Confirmation */}
                                {showDeleteId === conversation.id && (
                                    <div className="mt-2 rounded-md border border-red-900/40 bg-red-950/20 p-2">

                                        <p className="text-[11px] text-[#D7C8BD]">
                                            Delete this conversation?
                                        </p>

                                        <div className="mt-2 flex justify-end gap-2">

                                            <button
                                                onClick={() => setShowDeleteId(null)}
                                                className="rounded px-2 py-1 text-[10px] text-[#A39B90] hover:bg-[#302820]"
                                            >
                                                Cancel
                                            </button>

                                            <button
                                                onClick={() =>
                                                    deleteMutation.mutate(conversation.id)
                                                }
                                                disabled={deleteMutation.isPending}
                                                className="rounded bg-red-500/15 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                                            >
                                                {deleteMutation.isPending
                                                    ? "Deleting..."
                                                    : "Delete"}
                                            </button>

                                        </div>
                                    </div>
                                )}

                            </div>
                        ))}

                    </div>
                )}

            </div>
        </div>
    );
}
