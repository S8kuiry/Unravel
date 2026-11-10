
"use client";

import { useCallback, useState } from "react";

import ConversationHome from "./ConversationHome";
import ChatView from "./ChatView";

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
    // Navigation State
    // --------------------------------------

    const [mode, setMode] = useState<ChatMode>("home");

    const [activeConversationId, setActiveConversationId] =
        useState<string | null>(null);

    // --------------------------------------
    // Start New Conversation
    // --------------------------------------

    const handleNewConversation = useCallback(() => {
        setActiveConversationId(null);
        setMode("chat");
    }, []);

    // --------------------------------------
    // Open Existing Conversation
    // --------------------------------------

    const handleOpenConversation = useCallback((id: string) => {
        setActiveConversationId(id);
        setMode("chat");
    }, []);

    // --------------------------------------
    // Return to Conversation Home
    // --------------------------------------

    const handleBack = useCallback(() => {
        setMode("home");
        setActiveConversationId(null);
    }, []);

    // --------------------------------------
    // Handle First Message Conversation Creation
    // --------------------------------------

    const handleConversationCreated = useCallback((id: string) => {
        setActiveConversationId(id);
    }, []);

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
