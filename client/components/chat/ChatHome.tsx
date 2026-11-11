
"use client";

import { useCallback, useState } from "react";

import ConversationHome from "./ConversationHome";
import ChatView from "./ChatView";
import { useSearchParams } from "next/navigation";
import { setChatParam } from "@/lib/chat/chatUrl";
// ==========================================
// TYPES
// ==========================================

interface ChatHomeProps {
    repoId?: string;
    repoName: string;
    branch: string;
}

type ChatMode = "home" | "chat";

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function ChatHome({
    repoId,
    repoName,
    branch,
}: ChatHomeProps) {

    // --------------------------------------
    // Navigation State (lives in the URL)
    // --------------------------------------

    const searchParams = useSearchParams();

    // null = home, "new" = blank chat, "<id>" = existing conversation
    const chat = searchParams.get("chat");
    const mode: ChatMode = chat ? "chat" : "home";
    const activeConversationId = chat && chat !== "new" ? chat : null;

    const handleNewConversation = useCallback(() => setChatParam("new"), []);
    const handleOpenConversation = useCallback((id: string) => setChatParam(id), []);
    const handleBack = useCallback(() => setChatParam(null), []);
    const handleConversationCreated = useCallback(
        (id: string) => setChatParam(id, true),
        []
    );





    // --------------------------------------
    // Repository Not Ready
    // --------------------------------------

    if (!repoId) {
        return (
            <div className="flex h-full min-h-0 items-center justify-center p-5 text-center">
                <p className="text-xs text-[#A39B90]">
                    Preparing repository...
                </p>
            </div>
        );
    }

    // ======================================
    // CONVERSATION HOME
    // ======================================

    if (mode === "home") {
        return (
            <ConversationHome
                repoId={repoId}
                repoName={repoName}
                onNewConversation={handleNewConversation}
                onOpenConversation={handleOpenConversation}
            />
        );
    }

    // ======================================
    // CHAT VIEW
    // ======================================

    return (
        <ChatView
            repoId={repoId}
            repoName={repoName}
            branch={branch}
            conversationId={activeConversationId}
            onBack={handleBack}
            onConversationCreated={handleConversationCreated}
        />
    );
}
