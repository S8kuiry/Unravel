
"use client";

import { useEffect, useRef } from "react";
import {
    Bot,
    User,
    Sparkles,
    AlertCircle,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

export interface ChatMessage {
    id: string;
    conversation_id: string;
    role: string;
    content: string;
    created_at: string;
    status?: "pending" | "completed" | "error";
}

interface MessageListProps {
    messages: ChatMessage[];
    isSending: boolean;
}

// ==========================================
// COMPONENT
// ==========================================

export default function MessageList({
    messages,
    isSending,
}: MessageListProps) {

    const bottomRef = useRef<HTMLDivElement>(null);

    // --------------------------------------
    // Auto Scroll
    // --------------------------------------

    useEffect(() => {
        bottomRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "end",
        });
    }, [messages, isSending]);

    // ======================================
    // EMPTY STATE
    // ======================================

    if (messages.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">

                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#51402A] bg-[#252018]">
                    <Sparkles
                        size={25}
                        className="text-[#F5A524]"
                    />
                </div>

                <h3 className="text-base font-semibold text-[#E8E2D9]">
                    What can I help you with?
                </h3>

                <p className="mt-2 max-w-xs text-xs leading-relaxed text-[#938A7F]">
                    Ask me anything about your repository. I can help you
                    understand code, debug issues, and explore your project.
                </p>

                <div className="mt-6 grid w-full max-w-sm grid-cols-1 gap-2">

                    {[
                        "Explain this codebase",
                        "Find potential bugs",
                        "Explain the project structure",
                    ].map((suggestion) => (
                        <div
                            key={suggestion}
                            className="rounded-lg border border-[#383128] bg-[#1D1915] px-3 py-2.5 text-left text-[11px] text-[#B7ADA1]"
                        >
                            {suggestion}
                        </div>
                    ))}

                </div>

            </div>
        );
    }

    // ======================================
    // MESSAGE LIST
    // ======================================

    return (
        <div className="h-full overflow-y-auto px-3 py-4">

            <div className="mx-auto flex max-w-3xl flex-col gap-5">

                {messages.map((message) => {

                    const isUser = message.role === "user";
                    const isError = message.status === "error";
                    const isPending = message.status === "pending";

                    return (
                        <div
                            key={message.id}
                            className={`flex gap-2.5 ${
                                isUser ? "flex-row-reverse" : "flex-row"
                            }`}
                        >

                            {/* Avatar */}
                            <div
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                    isUser
                                        ? "bg-[#302820]"
                                        : "bg-[#3A2B18]"
                                }`}
                            >
                                {isUser ? (
                                    <User
                                        size={14}
                                        className="text-[#C9BBA9]"
                                    />
                                ) : (
                                    <Bot
                                        size={15}
                                        className="text-[#F5A524]"
                                    />
                                )}
                            </div>

                            {/* Message Content */}
                            <div
                                className={`min-w-0 max-w-[85%] rounded-xl px-3 py-2.5 ${
                                    isUser
                                        ? "bg-[#302820] text-[#E8E2D9]"
                                        : "border border-[#302B25] bg-[#1D1915] text-[#DDD5CA]"
                                }`}
                            >

                                {/* Role */}
                                <div className="mb-1.5 flex items-center gap-2">
                                    <span className="text-[10px] font-semibold text-[#A89C8C]">
                                        {isUser ? "You" : "Unravel Assistant"}
                                    </span>

                                    {isError && (
                                        <span className="flex items-center gap-1 text-[9px] text-red-400">
                                            <AlertCircle size={10} />
                                            Failed
                                        </span>
                                    )}
                                </div>

                                {/* Content */}
                                {isPending && !message.content ? (

                                    <div className="flex items-center gap-2 py-1 text-xs text-[#A39B90]">
                                        <span className="flex gap-1">
                                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#F5A524]" />
                                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#F5A524] [animation-delay:150ms]" />
                                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#F5A524] [animation-delay:300ms]" />
                                        </span>

                                        {isUser ? "Sending..." : "Thinking..."}
                                    </div>

                                ) : (

                                    <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                                        {message.content}
                                    </p>

                                )}

                                {/* Timestamp */}
                                <p className="mt-2 text-right text-[9px] text-[#756D63]">
                                    {new Date(message.created_at).toLocaleTimeString(
                                        undefined,
                                        {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        }
                                    )}
                                </p>

                            </div>

                        </div>
                    );
                })}

                {/* Sending Indicator */}
                {isSending && (
                    <div className="flex items-center gap-2 pl-9 text-[10px] text-[#827A70]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F5A524]" />
                        Processing your message...
                    </div>
                )}

                <div ref={bottomRef} />

            </div>
        </div>
    );
}
