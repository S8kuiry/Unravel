
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

/* ---------- Types ---------- */

export interface IndexProgress {
  total_files: number;
  indexed_files: number;
  processing_files: number;
  failed_files: number;
  skipped_files: number;
  pending_files: number;
  progress: number;
  finished: boolean;
}

export interface IndexJobEvent {
  path: string;
  status: "processing" | "completed" | "failed" | "skipped";
}

export interface IndexingFinishedEvent {
  total_files: number;
  indexed_files: number;
  failed_files: number;
  skipped_files: number;
  progress: number;
}

export interface RepositoryProgressCallbacks {
  onProgress?: (data: IndexProgress) => void;
  onJobStarted?: (data: IndexJobEvent) => void;
  onJobCompleted?: (data: IndexJobEvent) => void;
  onJobFailed?: (data: IndexJobEvent) => void;
  onJobSkipped?: (data: IndexJobEvent) => void;
  onIndexingCompleted?: (data: IndexingFinishedEvent) => void;
  onIndexingFinished?: (data: IndexingFinishedEvent) => void;
  onError?: (error: Error) => void;
  onConnected?: () => void;
}

/* ---------- SSE Helper ---------- */

export async function streamRepositoryIndexProgress(
  token: string,
  repoId: string,
  branch: string = "main",
  callbacks: RepositoryProgressCallbacks = {},
  signal?: AbortSignal
): Promise<void> {
  const url = `${API_BASE_URL}/repositories/${encodeURIComponent(
    repoId
  )}/index-progress?branch=${encodeURIComponent(branch)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      throw new Error(
        errorData.detail || "Failed to connect to repository indexing progress."
      );
    }

    if (!response.body) {
      throw new Error("Streaming is not supported by this response.");
    }

    callbacks.onConnected?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line.
      const events = buffer.split(/\r?\n\r?\n/);

      // Keep the last incomplete event for the next chunk.
      buffer = events.pop() ?? "";

      for (const event of events) {
        if (!event.trim() || event.startsWith(":")) continue;

        const lines = event.split(/\r?\n/);

        let eventName = "message";
        let eventData = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            eventData += line.slice(5).trim();
          }
        }

        if (!eventData) continue;

        try {
          const data = JSON.parse(eventData);

          switch (eventName) {
            case "progress":
              callbacks.onProgress?.(data as IndexProgress);
              break;

            case "job_started":
              callbacks.onJobStarted?.(data as IndexJobEvent);
              break;

            case "job_completed":
              callbacks.onJobCompleted?.(data as IndexJobEvent);
              break;

            case "job_failed":
              callbacks.onJobFailed?.(data as IndexJobEvent);
              break;

            case "job_skipped":
              callbacks.onJobSkipped?.(data as IndexJobEvent);
              break;

            case "indexing_completed":
              callbacks.onIndexingCompleted?.(
                data as IndexingFinishedEvent
              );
              break;

            case "indexing_finished":
              callbacks.onIndexingFinished?.(
                data as IndexingFinishedEvent
              );
              break;
          }
        } catch {
          console.error("Failed to parse SSE event:", event);
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      // Intentional disconnection. Don't report it as an error.
      return;
    }

    const parsedError =
      error instanceof Error
        ? error
        : new Error("Repository progress stream failed.");

    callbacks.onError?.(parsedError);
    throw parsedError;
  }
}
