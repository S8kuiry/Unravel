
"use client";

import { useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";

// ==========================================
// TYPES
// ==========================================

interface ChatComposerProps {
    onSend: (content: string) => Promise<void>;
    isSending: boolean;
    disabled?: boolean;
}

// ==========================================
// COMPONENT
// ==========================================

export default function ChatComposer({
    onSend,
    isSending,
    disabled = false,
}: ChatComposerProps) {

    const [message, setMessage] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ======================================
    // SEND MESSAGE
    // ======================================

    const handleSend = async () => {
        const content = message.trim();

        if (!content || isSending || disabled) return;

        // Clear input immediately for a responsive experience
        setMessage("");

        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }

        try {
            await onSend(content);
        } catch {
            // Restore the message if sending fails
            setMessage(content);
        }

        textareaRef.current?.focus();
    };

    // ======================================
    // KEYBOARD HANDLING
    // ======================================

    const handleKeyDown = (
        e: React.KeyboardEvent<HTMLTextAreaElement>
    ) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    };

    // ======================================
    // TEXTAREA AUTO RESIZE
    // ======================================

    const handleChange = (
        e: React.ChangeEvent<HTMLTextAreaElement>
    ) => {
        setMessage(e.target.value);

        const textarea = e.target;

        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(
            textarea.scrollHeight,
            160
        )}px`;
    };

    // ======================================
    // RENDER
    // ======================================

    return (
        <div className="shrink-0 border-t border-[#302B25] bg-[#141210] p-3">

            <div className="mx-auto max-w-3xl">

                {/* Input Container */}
                <div className="flex items-end gap-2 rounded-xl border border-[#40372D] bg-[#1D1915] px-3 py-2 transition focus-within:border-[#A8752D]">

                    <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        rows={1}
                        placeholder={
                            disabled
                                ? "Loading conversation..."
                                : "Ask anything about your codebase..."
                        }
                        className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-xs leading-relaxed text-[#E8E2D9] outline-none placeholder:text-[#756D63] disabled:cursor-not-allowed"
                    />

                    {/* Send Button */}
                    <button
                        onClick={() => void handleSend()}
                        disabled={
                            !message.trim() ||
                            isSending ||
                            disabled
                        }
                        className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F5A524] text-[#17130D] transition hover:bg-[#FFB83F] disabled:cursor-not-allowed disabled:bg-[#494036] disabled:text-[#827A70]"
                        title="Send message"
                    >
                        {isSending ? (
                            <Loader2
                                size={15}
                                className="animate-spin"
                            />
                        ) : (
                            <ArrowUp size={17} />
                        )}
                    </button>

                </div>

                {/* Footer */}
                <div className="mt-2 flex items-center justify-between px-1">
                    <p className="text-[9px] text-[#756D63]">
                        Enter to send · Shift + Enter for new line
                    </p>

                    <p className="text-[9px] text-[#756D63]">
                        Unravel AI
                    </p>
                </div>

            </div>
        </div>
    );
}
