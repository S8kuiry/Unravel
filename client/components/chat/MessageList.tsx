
"use client";

import { useEffect, useRef } from "react";
import {
    Bot,
    User,
    Sparkles,
    AlertCircle,
} from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";

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
        <div className="relative h-full">
            <div className="pointer-events-none absolute -top-10 right-0 h-48 w-48 rounded-full bg-[#F5A524]/10 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-48 w-48 rounded-full bg-[#F5A524]/[0.06] blur-3xl" />
            <div className="relative h-full overflow-y-auto px-3 py-4">
                <div className="mx-auto flex max-w-3xl flex-col gap-5">

                    {messages.map((message) => {

                        const isUser = message.role === "user";
                        const isError = message.status === "error";
                        const isPending = message.status === "pending";

                        return (
                            <div
                                key={message.id}
                                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`min-w-0 rounded-2xl border px-3.5 py-3 backdrop-blur-xl ${isUser
                                        ? "max-w-[85%] border-[#F5A524]/20 bg-gradient-to-br from-[#F5A524]/[0.14] to-[#302820]/60 text-[#F1E9DD] shadow-[0_4px_24px_-8px_rgba(245,165,36,0.3)]"
                                        :
                                        "relative max-w-[98%] overflow-hidden border-white/[0.10] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-[#F5A524]/[0.04] backdrop-blur-xl text-[#E3DBCF] ring-1 ring-inset ring-white/[0.04] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.10)]"}`}
                                >

                                    {/* Agent header */}
                                    {!isUser && (
                                        <>
                                            {/* amber top hairline */}
                                            {/* <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#F5A524]/50 to-transparent" /> */}
                                            {/* soft corner glow */}
                                            {/* <div className="pointer-events-none absolute -left-10 -top-10 h-28 w-28 rounded-full bg-[#F5A524]/10 blur-2xl" /> */}
                                            <div className="mb-2 flex items-center gap-1.5">
                                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#F5A524]/15 ring-1 ring-[#F5A524]/25">
                                                    <Bot size={12} className="text-[#F5A524]" />
                                                </div>
                                                <span className="text-[10px] font-semibold tracking-wide text-[#A89C8C]">
                                                    Unravel Assistant
                                                </span>
                                                {isError && (
                                                    <span className="flex items-center gap-1 text-[9px] text-red-400">
                                                        <AlertCircle size={10} />
                                                        Failed
                                                    </span>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {/* Content (user: text + avatar side by side) */}
                                    <div className={isUser ? "flex items-start gap-2.5" : ""}>

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
                                            isUser ? (
                                                <p className="min-w-0 whitespace-pre-wrap break-words text-xs leading-relaxed">
                                                    {message.content}
                                                </p>
                                            ) : (
                                                <MarkdownRenderer content={message.content} />
                                            )
                                        )}

                                        {isUser && (
                                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.08] ring-1 ring-white/10">
                                                <User size={11} className="text-[#E3D6C4]" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Timestamp */}
                                    <p className="mt-2 text-right text-[9px] text-[#756D63]">
                                        {isUser && isError && (
                                            <span className="mr-2 text-red-400">Failed</span>
                                        )}
                                        {new Date(message.created_at).toLocaleTimeString(undefined, {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </p>

                                </div>
                            </div>
                        );
                    })}

                    {/* Sending Indicator */}
                    {isSending && (
                        <div className="flex w-fit items-center gap-2 rounded-full border border-white/[0.07] bg-[#1D1915]/60 px-3 py-1.5 text-[10px] text-[#938A7F] backdrop-blur-xl">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F5A524]" />
                            Processing your message...
                        </div>
                    )}

                    <div ref={bottomRef} />

                </div>
            </div>
        </div>

    );
}
