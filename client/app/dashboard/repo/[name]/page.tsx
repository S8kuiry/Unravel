"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Group, Panel } from "react-resizable-panels";
import { sans, serif } from "@/app/config/font";
import { Check, ChevronRight, ChevronDown, Copy, File, Folder, FolderOpen, Send, Sparkles } from "lucide-react";
import { Card, Handle } from "@/components/Panel";
import { useAuth } from "@/context/AuthContext";
import {
    getRepositoryFileContents,
    getRepositoryFiles,
} from "@/api/github";
import type { RepoFileEntry } from "@/types/github";
import { buildFileTree, FileTreeNode } from "@/components/workspace/FileHandler";

export default function RepoWorkspacePage({
    params,
}: {
    params: Promise<{ name: string }>;
}) {
    const resolvedParams = use(params);
    const repoName = resolvedParams.name;
    const searchParams = useSearchParams();
    const owner = searchParams.get("owner") ?? "";
    const { getAuthToken } = useAuth();

    const [files, setFiles] = useState<RepoFileEntry[]>([]);
    const [branch, setBranch] = useState("main");
    const [truncated, setTruncated] = useState(false);
    const [filesLoading, setFilesLoading] = useState(true);
    const [filesError, setFilesError] = useState<string | null>(null);
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string>("");
    const [contentLoading, setContentLoading] = useState(false);
    const [contentError, setContentError] = useState<string | null>(null);
    const [chatInput, setChatInput] = useState("");
    const [copied, setCopied] = useState(false);

    const fetchFiles = useCallback(async () => {
        if (!owner) {
            setFilesError("Missing repository owner. Open this repo from the dashboard list.");
            setFilesLoading(false);
            return;
        }
        try {
            setFilesLoading(true);
            setFilesError(null);
            const token = await getAuthToken();
            if (!token) {
                setFilesError("You are not authenticated.");
                return;
            }
            const res = await getRepositoryFiles(token, owner, repoName, "main");
            setBranch(res.data.branch);
            setTruncated(res.data.truncated);
            setFiles(res.data.files);
            setActiveFile((prev) => {
                if (prev && res.data.files.some((f) => f.path === prev)) return prev;
                return res.data.files[0]?.path ?? null;
            });
        } catch (err) {
            setFilesError(err instanceof Error ? err.message : "Failed to load files.");
        } finally {
            setFilesLoading(false);
        }
    }, [getAuthToken, owner, repoName]);

    useEffect(() => {
        void fetchFiles();
    }, [fetchFiles]);

    useEffect(() => {
        let cancelled = false;
        async function loadContent() {
            if (!activeFile || !owner) return;
            try {
                setContentLoading(true);
                setContentError(null);
                const token = await getAuthToken();
                if (!token) {
                    if (!cancelled) setContentError("You are not authenticated.");
                    return;
                }
                const res = await getRepositoryFileContents(
                    token,
                    owner,
                    repoName,
                    [activeFile],
                    branch
                );
                if (!cancelled) {
                    setFileContent(res.data[0]?.content ?? "");
                }
            } catch (err) {
                if (!cancelled) {
                    setContentError(err instanceof Error ? err.message : "Failed to load file content.");
                    setFileContent("");
                }
            } finally {
                if (!cancelled) setContentLoading(false);
            }
        }
        void loadContent();
        return () => {
            cancelled = true;
        };
    }, [activeFile, branch, getAuthToken, owner, repoName]);

    const fileLabel = useMemo(
        () => activeFile ?? "Select a file",
        [activeFile]
    );

    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(fileContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy code:", err);
        }
    };

    const fileTree = useMemo(() =>
        buildFileTree(files),
        [files])

    return (
        <div className={`flex h-[calc(100dvh-3.0rem)] min-h-[560px] w-full flex-col ${sans.className}`}>

            {/* Header */}
            <div className="flex items-center justify-between pb-4 shrink-0">
                <div>
                    <h1 className={`${serif.className} text-2xl font-medium text-[#ECE7DF]`}>
                        {owner ? `${owner}/${repoName}` : repoName}
                    </h1>
                    <p className="mt-0.5 text-xs text-[#A39B90]">
                        {branch} branch • {files.length} files{truncated ? " • truncated" : ""}
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
                            meta={fileLabel}
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
                                    {filesLoading && (
                                        <p className="px-3 py-4 text-xs text-[#6F675D]">Loading files…</p>
                                    )}
                                    {!filesLoading && filesError && (
                                        <div className="px-3 py-2 text-xs text-red-400">
                                            <p>{filesError}</p>
                                            <button
                                                onClick={() => void fetchFiles()}
                                                className="mt-2 rounded-md border border-[#2B2723] px-2 py-1 text-[#ECE7DF] hover:border-[#F5A524]"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    )}
                                    {!filesLoading && !filesError && files.length === 0 && (
                                        <p className="px-3 py-4 text-xs text-[#6F675D]">No files found.</p>
                                    )}
                                    {!filesLoading && !filesError && fileTree.map((node) => (
                                        <FileTreeNode
                                            key={node.path}
                                            node={node}
                                            activeFile={activeFile}
                                            onSelectFile={setActiveFile}
                                        />
                                    ))}
                                </div>

                                {/* File Viewer with Sticky/Header Copy Action */}
                                <div className="relative flex-1 overflow-auto bg-[#0E0D0C] p-4">
                                    {contentLoading && (
                                        <p className="font-mono text-xs text-[#6F675D]">Loading content…</p>
                                    )}
                                    {!contentLoading && contentError && (
                                        <p className="font-mono text-xs text-red-400">{contentError}</p>
                                    )}
                                    {!contentLoading && !contentError && (
                                        <pre className="font-mono text-xs leading-relaxed text-[#ECE7DF]">
                                            <code>{fileContent || "Select a file to view its contents."}</code>
                                        </pre>
                                    )}
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