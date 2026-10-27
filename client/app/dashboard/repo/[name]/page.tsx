"use client";

import { use, useMemo, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Group, Panel } from "react-resizable-panels";
import { sans, serif } from "@/app/config/font";
import { Check, Copy, RefreshCw, Send, Sparkles } from "lucide-react";
import { Card, Handle, GithubMark } from "@/components/Panel";
import { useAuth } from "@/context/AuthContext";
import {
    getRepositoryFileContents,
    getRepositoryFiles,
    hydrateRepository,
} from "@/api/github";
import { buildFileTree, FileTreeNode } from "@/components/workspace/FileHandler";
import FileViewer from "@/components/workspace/FileViewer";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { disconnectGithub, approveGithub } from "@/api/user";
import { GithubApproveRequest } from "@/types/user";
import { GithubAuthProvider, linkWithPopup, signInWithPopup, getAdditionalUserInfo, unlink } from "firebase/auth";
import { auth } from "@/app/config/firebase";
import { isGithubTokenExpired } from "@/lib/github-session";
import { useExpandedFolders } from "@/lib/useExpandedFolders";
import { OpenedRepoRow } from "@/types/github";
import BranchSelector from "@/components/workspace/BranchSelector";
import { testChunkFile } from "@/api/ingestion";

export default function RepoWorkspacePage({
    params,
}: {
    params: Promise<{ name: string }>;
}) {
    const { user } = useAuth()
    const resolvedParams = use(params);
    const repoName = resolvedParams.name;
    const searchParams = useSearchParams();
    const owner = searchParams.get("owner") ?? "";
    const router = useRouter();
    const { getAuthToken, fetchDbUser } = useAuth();
    const [currentBranch, setCurrentBranch] = useState("main");
    const activeFile = searchParams.get("file");
    const [chatInput, setChatInput] = useState("");
    const [copied, setCopied] = useState(false);
    const queryClient = useQueryClient();
    const { expanded, toggle: toggleFolder } = useExpandedFolders(
        `unravel:expanded:${owner}/${repoName}:${currentBranch}`,
        activeFile
    );
    const [loginGit, setLoginGit] = useState(false);
    const hydratedKey = useRef<string | null>(null);

    /* ---------- File Select Function ---------- */

    const filesKey = ["repo-files", owner, repoName, currentBranch] as const;

    const handleSelectFile = useCallback((path: string) => {
        const params = new URLSearchParams(window.location.search);
        params.set("file", path);
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }, []);

    // GitHub login handler (reused from dashboard /workspace)
    const handleGithubConnect = async () => {
        if (loginGit) return;

        const currentUser = auth.currentUser;
        if (!currentUser) {
            toast.error("You must be logged in to connect GitHub.");
            return;
        }

        setLoginGit(true);

        try {
            const provider = new GithubAuthProvider();
            provider.addScope("user:email");
            provider.addScope("read:org");
            provider.addScope("repo");

            const isAlreadyLinked = currentUser.providerData.some(
                (p) => p.providerId === GithubAuthProvider.PROVIDER_ID
            );

            let githubAccessToken: string | null = null;
            let githubUsername: string | null = null;

            if (!isAlreadyLinked) {
                const result = await linkWithPopup(currentUser, provider);
                const credential = GithubAuthProvider.credentialFromResult(result);
                githubAccessToken = credential?.accessToken || null;
                githubUsername = getAdditionalUserInfo(result)?.username || null;
            } else {
                const result = await signInWithPopup(auth, provider);
                const credential = GithubAuthProvider.credentialFromResult(result);
                githubAccessToken = credential?.accessToken || null;
                githubUsername = getAdditionalUserInfo(result)?.username || null;
            }

            const token = await getAuthToken(true);
            if (!token) {
                toast.error("Authentication token not found.");
                return;
            }

            const payload: GithubApproveRequest = {
                github_access_token: githubAccessToken || "",
                github_login: githubUsername || "",
            };

            const res = await approveGithub(token, payload);
            await fetchDbUser();

            if (res.status === "success") {
                toast.success("GitHub Connected successfully!");
            }
        } catch (error: unknown) {
            console.error("GitHub connect error:", error);
            const errorCode =
                typeof error === "object" && error !== null && "code" in error
                    ? error.code
                    : undefined;
            if (
                errorCode === "auth/popup-closed-by-user" ||
                errorCode === "auth/cancelled-popup-request" ||
                errorCode === "auth/popup-blocked"
            ) {
                toast.warning("GitHub sign-in popup was closed or blocked.");
            } else {
                toast.error("GitHub connection failed.");
            }
        } finally {
            setLoginGit(false);
        }
    };



    /* ---------- File list ---------- */
    const filesQuery = useQuery({
        queryKey: filesKey,
        enabled: Boolean(owner && repoName && currentBranch),
        staleTime: 10 * 60 * 1000,
        gcTime: 15 * 60 * 1000, // <--- Add individual gcTime here (e.g. 1 hour)
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

    // ✅ Sync branch state safely when query succeeds
    useEffect(() => {
        if (filesQuery.data?.branch && filesQuery.data.branch !== currentBranch) {
            setCurrentBranch(filesQuery.data.branch);
        }
    }, [filesQuery.data?.branch, currentBranch]);

    const files = filesQuery.data?.files ?? [];
    const branch = filesQuery.data?.branch ?? currentBranch;
    const truncated = filesQuery.data?.truncated ?? false;
    const filesLoading = filesQuery.isPending;
    const filesError = filesQuery.error?.message ?? null;
    const filesExpired = isGithubTokenExpired(filesError);

        /* ---------- Hydrate contents once per repo open ---------- */
    useEffect(() => {
        if (!filesQuery.isSuccess || !owner) return;
        const key = `${owner}/${repoName}/${branch}`;
        if (hydratedKey.current === key) return;
        hydratedKey.current = key;

        (async () => {
            try {
                const token = await getAuthToken();
                if (!token) return;
                await hydrateRepository(token, owner, repoName, branch);
            } catch (err) {
                console.error("Hydrate failed:", err);
            }
        })();
    }, [filesQuery.isSuccess, owner, repoName, branch, getAuthToken]);


    /* ---------- File content ---------- */
    const contentQuery = useQuery({
        queryKey: ["repo-content", owner, repoName, branch, activeFile],
        enabled: !!activeFile && filesQuery.isSuccess,
        staleTime: 30 * 60 * 1000,
        gcTime: 35 * 60 * 1000, // <--- Add individual gcTime here (e.g. 1 hour)
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
        mutationFn: async () => {
            const token = await getAuthToken();

            if (!token) {
                throw new Error("You are not authenticated.");
            }

            const res = await getRepositoryFiles(
                token,
                owner,
                repoName,
                currentBranch,
                true
            );

            return res.data;
        },

        onSuccess: async (files) => {
            // Store the freshly fetched file list.
            queryClient.setQueryData(filesKey, files);

            // Re-hydrate in the background; failures are not user-facing.
            getAuthToken()
                .then((t) => (t ? hydrateRepository(t, owner, repoName, files.branch) : null))
                .catch((err) => console.error("Hydrate failed:", err));

            // Check if the currently open activeFile still exists in the refreshed file list
            if (activeFile) {
                const fileExists = files?.files?.some((f: { path: string }) => f.path === activeFile);
                if (!fileExists) {
                    // Clear active file from search params if it was deleted from git
                    const params = new URLSearchParams(window.location.search);
                    params.delete("file");
                    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
                }
            }

            // Refetch active file-content queries only after the
            // refreshed file list has arrived.
            await queryClient.invalidateQueries({
                queryKey: [
                    "repo-content",
                    owner,
                    repoName,
                    files.branch,
                ],
                refetchType: "active",
            });
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Refresh failed.");
        },
    });

    /* ------------- sidebar data fetcing  trigger --------------- */
    useEffect(() => {
        if (filesQuery.isSuccess && owner && repoName) {
            // 1. Optimistically update the opened-repos cache so this repo moves to the top instantly
            queryClient.setQueryData(["opened-repos", user?.uid], (oldData: OpenedRepoRow[] | undefined) => {
                if (!oldData) return oldData;

                const now = new Date().toISOString();
                const existingIndex = oldData.findIndex(r => r.name === repoName && r.owner === owner);

                if (existingIndex > -1) {
                    // Update existing repo's timestamp to now
                    const updated = [...oldData];
                    updated[existingIndex] = { ...updated[existingIndex], last_opened_at: now };
                    return updated;
                }
                return oldData;
            });

            // 2. Trigger background refetch to sync with backend DB
            queryClient.invalidateQueries({ queryKey: ["opened-repos"] });
        }
    }, [filesQuery.isSuccess, owner, repoName, queryClient, user?.uid]);



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



    // Token expired mid-session: clean up GitHub session (unlink Firebase provider,
    // revoke backend token) but stay on this page so the connect card above remains
    // visible and usable. The connect card drives the actual reconnect flow via
    // handleGithubConnect().
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
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [filesExpired, fetchDbUser, getAuthToken, router]);

    return (
        <div className={`flex h-[calc(100dvh-3.0rem)] min-h-[560px] w-full flex-col ${sans.className}`}>

       

            {/* Header */}
            <div className="flex items-center justify-between pb-4 shrink-0">
                <div className="flex items-start justify-start gap-6">
                    <div>
                        <h1 className={`${serif.className} text-2xl font-medium text-[#ECE7DF]`}>
                            {owner ? `${owner}/${repoName}` : repoName}
                        </h1>
                        <p className="mt-0.5 text-xs text-[#A39B90]">
                            {branch} branch • {files.length} files{truncated ? " • truncated" : ""}
                        </p>

                    </div>
                    <BranchSelector
                        owner={owner}
                        repoName={repoName}
                        currentBranch={currentBranch}
                        onSelectBranch={(newBranch) => {
                            setCurrentBranch(newBranch);
                            // Clear active file search parameter when switching branches
                            const params = new URLSearchParams(window.location.search);
                            params.delete("file");
                            window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);

                            // Explicitly invalidate repo contents and files for the new branch context
                            queryClient.invalidateQueries({ queryKey: ["repo-files", owner, repoName] });
                            queryClient.invalidateQueries({ queryKey: ["repo-content", owner, repoName] });
                        }}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <span className="rounded-md border border-[#2B2723] bg-[#181614] px-2.5 py-1 text-xs font-medium text-[#F5A524]">
                        Indexed
                    </span>
                </div>
            </div>

            {/* Main Resizable Workspace */}
            <div className="min-h-0 flex-1">
                {filesExpired ? (
                    <div className="mx-auto mt-20 max-w-md text-center">
                        <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl border border-[#2B2723] bg-[#181614] text-[#ECE7DF]">
                            <GithubMark className="h-7 w-7" />
                        </div>
                        <h1 className={`${serif.className} mt-6 text-3xl font-medium text-[#ECE7DF]`}>
                            Connect your GitHub account
                        </h1>
                        <p className="mt-3 text-sm leading-relaxed text-[#A39B90]">
                            Your GitHub session has expired. Reconnect to browse repository files and ask questions about this codebase.
                        </p>
                        <button
                            onClick={handleGithubConnect}
                            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#F5A524] px-4 py-2.5 text-sm font-medium text-[#1A1206] outline-none transition-colors hover:bg-[#FBBF4D]"
                        >
                            <GithubMark /> Connect GitHub
                        </button>
                    </div>
                ) : (
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
                                        onClick={() => refreshMutation.mutate()}
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
                                        <div className="px-3 py-2 text-[10px] text-red-400">
                                            <p>{filesError}</p>
                                            <button
                                                onClick={() => void filesQuery.refetch()}
                                                disabled={filesQuery.isFetching}
                                                className="mt-2  cursor-pointer rounded-md border border-[#2B2723] px-2 py-1.5 text-[#ECE7DF] hover:border-[#F5A524] disabled:cursor-not-allowed disabled:opacity-60"
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
                )
            }
            </div>

        </div>
    );
}