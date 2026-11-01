"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  IndexProgress,
  streamRepositoryIndexProgress,
} from "@/api/sse";

interface RepositoryIndexPageProps {
  repoId: string;
  branch: string;
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
    if (!repoId) return;

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

  return (
    <div>
      <h2>Repository Indexing</h2>

      <p>Status: {status}</p>

      {progress && (
        <>
          <h3>{progress.progress}%</h3>

          <progress value={progress.progress} max={100} />

          <p>Total files: {progress.total_files}</p>
          <p>Indexed: {progress.indexed_files}</p>
          <p>Processing: {progress.processing_files}</p>
          <p>Pending: {progress.pending_files}</p>
          <p>Failed: {progress.failed_files}</p>
          <p>Skipped: {progress.skipped_files}</p>
        </>
      )}

      {activeFile && <p>Currently processing: {activeFile}</p>}
    </div>
  );
}