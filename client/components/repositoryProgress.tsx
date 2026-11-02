"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  IndexProgress,
  streamRepositoryIndexProgress,
} from "@/api/sse";

interface RepositoryIndexPageProps {
  repoId?: string;
  branch: string;
}

// Swaps text with a fade, at most once per `interval` ms,
// so fast-firing file events don't flicker.
function useCyclingText(target: string, interval = 900) {
  const [shown, setShown] = useState(target);
  const [visible, setVisible] = useState(true);
  const latest = useRef(target);
  const shownRef = useRef(target);
  latest.current = target;

  useEffect(() => {
    const id = setInterval(() => {
      if (latest.current === shownRef.current) return;
      setVisible(false);
      setTimeout(() => {
        shownRef.current = latest.current;
        setShown(latest.current);
        setVisible(true);
      }, 200);
    }, interval);
    return () => clearInterval(id);
  }, [interval]);

  return { shown, visible };
}


export default function RepositoryIndexPage({
  repoId,
  branch,
}: RepositoryIndexPageProps) {
  const { getAuthToken } = useAuth();

  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [status, setStatus] = useState("Connecting...");
  const [activeFile, setActiveFile] = useState("");

  useEffect(() => {
    if (!repoId) {
      setStatus("Waiting for repository...");
      return;
    }

    const controller = new AbortController();

    const startProgressStream = async () => {
      try {
        // Get the actual token, not the function itself.
        const token = await getAuthToken();

        if (!token) {
          setStatus("Authentication required");
          return;
        }

        if (controller.signal.aborted) return;

        setStatus("Connecting...");

        await streamRepositoryIndexProgress(
          token,
          repoId,
          branch,
          {
            onConnected: () => {
              setStatus("Connected");
            },

            onProgress: (data) => {
              setProgress(data);
              if (data.finished) setStatus("Finished");
            },

            onJobStarted: (data) => {
              setActiveFile(data.path);
            },

            onJobCompleted: (data) => {
              console.log("Completed:", data.path);
            },

            onJobFailed: (data) => {
              console.error("Failed:", data.path);
            },

            onJobSkipped: (data) => {
              console.log("Skipped:", data.path);
            },

            onIndexingCompleted: () => {
              setStatus("Indexing completed successfully");
            },

            onIndexingFinished: () => {
              setStatus("Indexing finished");
            },

            onError: (error) => {
              setStatus(error.message);
            },
          },
          controller.signal
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setStatus(
            error instanceof Error ? error.message : "Something went wrong"
          );
        }
      }
    };

    startProgressStream();

    return () => {
      controller.abort();
    };
  }, [repoId, branch, getAuthToken]);

  const isDone =
    !!progress?.finished ||
    progress?.progress === 100 ||
    status === "Indexing completed successfully" ||
    status === "Indexing finished";

  const liveText = activeFile
    ? activeFile.split("/").slice(-2).join("/")
    : status;

  const { shown, visible } = useCyclingText(liveText);
  const pct = Math.round(progress?.progress ?? 0);

  return (
    <div
      className={`relative inline-flex h-6 py-2 items-center gap-2 overflow-hidden px-2 text-xs backdrop-blur ${isDone ? "" : "w-50"
        }`}
    >
      {isDone ? (
        <>
          <svg
            className="h-3.5 w-3.5 shrink-0 text-emerald-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className="font-medium text-neutral-200">Indexed</span>
          <span className="text-neutral-500">
            · {progress?.total_files ?? 0} files
          </span>
        </>
      ) : (
        <>
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-neutral-400" />
          <span
            className={`text-xs min-w-0 flex-1 truncate font-mono text-neutral-400 transition-all duration-200 ${visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              }`}
          >
            {shown}
          </span>
          {(progress?.failed_files ?? 0) > 0 && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/80" />
          )}
          <span className="shrink-0 tabular-nums text-neutral-500">{pct}%</span>

          {/* progress line hugging the bottom edge of the pill */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-white/10">
            <div
              className="h-full bg-neutral-300 transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}