"use client";

import { use, useState } from "react";
import { Group, Panel } from "react-resizable-panels";
import { sans, serif } from "@/app/config/font";
import { Check, Copy, File, Folder, Send, Sparkles } from "lucide-react";
import { Card, Handle } from "@/components/Panel";

// --- MOCK DATA ---
const MOCK_FILES = [
    { name: ".github", type: "folder" },
    { name: "src", type: "folder" },
    { name: "tests", type: "folder" },
    { name: ".gitignore", type: "file" },
    { name: "main.py", type: "file" },
    { name: "README.md", type: "file" },
    { name: "requirements.txt", type: "file" },
];

const MOCK_CODE = `from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from db.database import get_db

app = FastAPI(title="CloudComputing-Subharthy")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}

@app.get("/api/v1/data")
async def get_data(db: AsyncSession = Depends(get_db)):
    # Fetching data logic here
    pass
`;

export default function RepoWorkspacePage({
    params,
}: {
    params: Promise<{ name: string }>;
}) {
    const resolvedParams = use(params);
    const repoName = resolvedParams.name;

    const [activeFile, setActiveFile] = useState("main.py");
    const [chatInput, setChatInput] = useState("");
    const [copied, setCopied] = useState(false);

    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(MOCK_CODE);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy code:", err);
        }
    };

    return (
        <div className={`flex h-[calc(100dvh-3.0rem)] min-h-[560px] w-full flex-col ${sans.className}`}>

            {/* Header */}
            <div className="flex items-center justify-between pb-4 shrink-0">
                <div>
                    <h1 className={`${serif.className} text-2xl font-medium text-[#ECE7DF]`}>
                        {repoName}
                    </h1>
                    <p className="mt-0.5 text-xs text-[#A39B90]">
                        main branch • Last synchronized 2 hours ago
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="rounded-md border border-[#2B2723] bg-[#181614] px-2.5 py-1 text-xs font-medium text-[#F5A524]">
                        Indexed
                    </span>
                </div>
            </div>

            {/* Main Resizable Workspace */}
            <div className="min-h-0 flex-1">
                <Group orientation="horizontal">

                    {/* LEFT PANEL: Codebase Explorer & File Content */}
                    <Panel id="codebase-view" defaultSize={65} minSize={35}>
                        <Card
                            title="Codebase Explorer"
                            meta={activeFile}
                            action={
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-[#A39B90]">Read-only mode</span>
                                    <button
                                        onClick={handleCopyCode}
                                        className="flex items-center gap-1.5 rounded-md border border-[#2B2723] bg-[#0E0D0C] px-2.5 py-1 text-xs font-medium text-[#ECE7DF] transition-colors hover:border-[#F5A524] hover:text-[#F5A524] focus:outline-none"
                                        title="Copy file contents"
                                    >
                                        {copied ? (
                                            <>
                                                <Check className="h-3 w-3 text-emerald-400" />
                                                <span className="text-emerald-400 text-xs">Copied</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-3 w-3" />
                                                <span className="text-xs">Copy</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            }
                        >
                            <div className="flex h-full min-h-0">
                                {/* File Tree */}
                                <div className="w-56 shrink-0 border-r border-[#2B2723] bg-[#141210] p-2 overflow-y-auto">
                                    <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-[#6F675D]">
                                        Files
                                    </div>
                                    {MOCK_FILES.map((file) => (
                                        <button
                                            key={file.name}
                                            onClick={() => file.type === "file" && setActiveFile(file.name)}
                                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-[#211E1B] ${activeFile === file.name
                                                ? "bg-[#211E1B] font-medium text-[#F5A524]"
                                                : "text-[#A39B90]"
                                                }`}
                                        >
                                            {file.type === "folder" ? (
                                                <Folder className="h-3.5 w-3.5 shrink-0 text-[#6F675D]" />
                                            ) : (
                                                <File className="h-3.5 w-3.5 shrink-0" />
                                            )}
                                            <span className="truncate">{file.name}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* File Viewer with Sticky/Header Copy Action */}
                                <div className="relative flex-1 overflow-auto bg-[#0E0D0C] p-4">
                                    <pre className="font-mono text-xs leading-relaxed text-[#ECE7DF]">
                                        <code>{MOCK_CODE}</code>
                                    </pre>
                                </div>
                            </div>
                        </Card>
                    </Panel>

                    {/* Resizable Divider using your custom Handle component */}
                    <Handle direction="horizontal" />

                    {/* RIGHT PANEL: AI Assistant Chat */}
                    <Panel id="ai-chat" defaultSize={35} minSize={25}>
                        <Card
                            title="Unravel Assistant"
                            meta="Agentic Chat"
                            action={<Sparkles className="h-4 w-4 text-[#F5A524]" />}
                        >
                            <div className="flex h-full flex-col justify-between p-4">

                                {/* Message Log */}
                                <div className="space-y-4 overflow-y-auto">
                                    <div className="flex gap-3 text-xs leading-relaxed">
                                        <div className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[#F5A524] font-bold text-[#1A1206]">
                                            AI
                                        </div>
                                        <div className="rounded-lg border border-[#2B2723] bg-[#211E1B]/60 p-3 text-[#ECE7DF]">
                                            <p>
                                                I have indexed <span className="font-semibold">{repoName}</span>. Ask me questions about repository files, structure, or code logic.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Input Controls */}
                                <div className="mt-4 pt-3 border-t border-[#2B2723]">
                                    <div className="relative flex items-end rounded-xl border border-[#2B2723] bg-[#0E0D0C] p-2 focus-within:border-[#F5A524] focus-within:ring-1 focus-within:ring-[#F5A524]">
                                        <textarea
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            placeholder="Ask about this codebase..."
                                            className="max-h-32 min-h-[40px] w-full resize-none bg-transparent px-2 py-1 text-xs text-[#ECE7DF] outline-none placeholder:text-[#6F675D]"
                                            rows={1}
                                        />
                                        <button className="mb-0.5 ml-2 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#F5A524] text-[#1A1206] transition-colors hover:bg-[#FBBF4D]">
                                            <Send className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </Card>
                    </Panel>

                </Group>
            </div>

        </div>
    );
}