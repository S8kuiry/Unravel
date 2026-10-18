"use client";

import { use, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Group, Panel } from "react-resizable-panels";
import { sans, serif } from "@/app/config/font";
import { Check, Copy, RefreshCw, Send, Sparkles } from "lucide-react";
import { Card, Handle } from "@/components/Panel";
import { useAuth } from "@/context/AuthContext";
import {
    getRepositoryFileContents,
    getRepositoryFiles,
} from "@/api/github";
import { buildFileTree, FileTreeNode } from "@/components/workspace/FileHandler";
import FileViewer from "@/components/workspace/FileViewer";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { disconnectGithub } from "@/api/user";
import { GithubAuthProvider, unlink } from "firebase/auth";
import { auth } from "@/app/config/firebase";
import { isGithubTokenExpired } from "@/lib/github-session";
import { useExpandedFolders } from "@/lib/useExpandedFolders";

export default function RepoWorkspacePage({
    params,
}: {
    params: Promise<{ name: string }>;
}) {
    const resolvedParams = use(params);
    const repoName = resolvedParams.name;
    const searchParams = useSearchParams();
    const owner = searchParams.get("owner") ?? "";
    const router = useRouter();
    const { getAuthToken, fetchDbUser } = useAuth();
    const [currentBranch, setCurrentBranch] = useState("main");
    // const [activeFile, setActiveFile] = useState<string | null>(null);  
    const activeFile = searchParams.get("file");
    const [chatInput, setChatInput] = useState("");
    const [copied, setCopied] = useState(false);
    const queryClient = useQueryClient();
    const filesKey = ["repo-files", owner, repoName, currentBranch] as const;
    const { expanded, toggle: toggleFolder } = useExpandedFolders(
        `unravel:expanded:${owner}/${repoName}:${currentBranch}`,
        activeFile
    );


    /* ---------- File Select Function ---------- */
    const handleSelectFile = useCallback((path: string) => {
        const params = new URLSearchParams(window.location.search);
        params.set("file", path);
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }, []);


    /* ---------- File list ---------- */
    const filesQuery = useQuery({
        queryKey: filesKey,
        enabled: !!owner,
        retry: false,
        queryFn: async () => {
            if (!owner) {
                throw new Error("Missing repository owner. Open this repo from the dashboard list.");
            }
            const token = await getAuthToken();
            if (!token) {
                throw new Error("You are not authenticated.");
            }
            const res = await getRepositoryFiles(token, owner, repoName, currentBranch);
            return res.data; // { files, branch, truncated }
        },
    });

    const files = filesQuery.data?.files ?? [];
    const branch = filesQuery.data?.branch ?? currentBranch;
    const truncated = filesQuery.data?.truncated ?? false;
    const filesLoading = filesQuery.isPending;
    const filesError = filesQuery.error?.message ?? null;
    const filesExpired = isGithubTokenExpired(filesError);

    // Token expired mid-session: auto-disconnect (same flow as sidebar/dashboard)
    // and send user to the connect view. Expiry notice is toast-only.
    useEffect(() => {
        if (!filesExpired) return;
        let cancelled = false;
        (async () => {
            try {
                const currentUser = auth.currentUser;
                if (currentUser) {
                    try {
                        await unlink(currentUser, GithubAuthProvider.PROVIDER_ID);
                    } catch {
                        /* already unlinked — continue */
                    }
                }
                const token = await getAuthToken();
                if (token) await disconnectGithub(token);
            } catch {
                /* best-effort revoke */
            } finally {
                if (cancelled) return;
                await fetchDbUser();
                toast.warning("GitHub session expired — please reconnect.");
                router.replace("/dashboard");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [filesExpired, fetchDbUser, getAuthToken, router]);


    /* ---------- File content ---------- */
    const contentQuery = useQuery({
        queryKey: ["repo-content", owner, repoName, branch, activeFile],
        enabled: !!activeFile && filesQuery.isSuccess,
        staleTime: 30 * 60 * 1000,
        retry: false,
        queryFn: async () => {
            const token = await getAuthToken();
            if (!token) {
                throw new Error("You are not authenticated.");
            }
            const res = await getRepositoryFileContents(
                token,
                owner,
                repoName,
                [activeFile as string],
                branch
            );
            return res.data[0]?.content ?? "";
        },
    });

    const fileContent = contentQuery.data ?? "";
    const contentLoading = contentQuery.isPending;
    const contentError = contentQuery.error?.message ?? null;




    /* ---------- Force Refresh ---------- */
    const refreshMutation = useMutation({
        mutationFn: async (file: string | null) => {
            const token = await getAuthToken();
            if (!token) throw new Error("You are not authenticated.");

            // Same two API functions the queries use, run together
            const [filesRes, contentRes] = await Promise.all([
                getRepositoryFiles(token, owner, repoName, currentBranch,true),
                file
                    ? getRepositoryFileContents(token, owner, repoName, [file], currentBranch)
                    : Promise.resolve(null),
            ]);

            return {
                files: filesRes.data,
                file,
                content: contentRes?.data[0]?.content ?? "",
            };
        },
        onSuccess: ({ files, file, content }) => {
            // 1. Mark every cached file in this repo stale, but fetch nothing yet
            queryClient.invalidateQueries({
                queryKey: ["repo-content", owner, repoName, currentBranch],
                refetchType: "none",
            });
            // 2. Write the fresh data (this also clears the stale mark on these entries)
            queryClient.setQueryData(filesKey, files);
            if (file) {
                queryClient.setQueryData(
                    ["repo-content", owner, repoName, files.branch, file],
                    content
                );
            }
        },

    });




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
                            title={"Codebase - " + `${fileLabel}`}
                            // meta={fileLabel}
                            action={
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-[#A39B90]">Read-only mode</span>
                                    <button
                                        onClick={() => refreshMutation.mutate(activeFile)}
                                        disabled={refreshMutation.isPending}
                                        className="cursor-pointer flex items-center gap-1.5 rounded-lg border border-[#2B2723] bg-[#0E0D0C] px-2.5 py-2 text-xs font-medium text-[#ECE7DF] transition-colors hover:border-[#F5A524] hover:text-[#F5A524] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        title="Refresh files"
                                    >
                                        <RefreshCw className={`h-3 w-3 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
                                    </button>
                                    <button
                                        onClick={handleCopyCode}
                                        className="cursor-pointer flex items-center gap-1.5 rounded-md border border-[#2B2723] bg-[#0E0D0C] px-2.5 py-1 text-xs font-medium text-[#ECE7DF] transition-colors hover:border-[#F5A524] hover:text-[#F5A524] focus:outline-none"
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
                                    {!filesLoading && filesError && !filesExpired && (
                                        <div className="px-3 py-2 text-xs text-red-400">
                                            <p>{filesError}</p>
                                            <button
                                                onClick={() => void filesQuery.refetch()}
                                                disabled={filesQuery.isFetching}
                                                className="mt-2 rounded-md border border-[#2B2723] px-2 py-1 text-[#ECE7DF] hover:border-[#F5A524] disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {filesQuery.isFetching ? "Retrying…" : "Retry"}
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
                                            onSelectFile={handleSelectFile}
                                            expanded={expanded}
                                            onToggleFolder={toggleFolder}
                                        />
                                    ))}
                                </div>

                                {/* File Viewer with Sticky/Header Copy Action */}
                                <FileViewer
                                    activeFile={activeFile}
                                    contentLoading={contentLoading}
                                    contentError={contentError}
                                    fileContent={fileContent}
                                />
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