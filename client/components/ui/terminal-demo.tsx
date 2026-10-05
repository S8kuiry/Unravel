"use client";

import { useEffect, useState } from "react";
import { AnimatedSpan, Terminal, TypingAnimation } from "./terminal";

const ESTIMATED_DURATION_MS = 14000; // rough time for all lines + typing to finish
const PAUSE_BEFORE_LOOP_MS = 2000;

export function TerminalDemo() {
  const [loopKey, setLoopKey] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setLoopKey((k) => k + 1);
    }, ESTIMATED_DURATION_MS + PAUSE_BEFORE_LOOP_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <Terminal key={loopKey}>
      <TypingAnimation className="text-zinc-200">&gt; contextforge init</TypingAnimation>

      <AnimatedSpan className="text-zinc-500">
        ✔ Provisioning Postgres (pgvector enabled)
      </AnimatedSpan>

      <AnimatedSpan className="text-zinc-500">
        ✔ FastAPI backend linked — CRUD + agent routes
      </AnimatedSpan>

      <AnimatedSpan className="text-zinc-500">
        ✔ GitHub OAuth configured
      </AnimatedSpan>

      <AnimatedSpan className="text-zinc-500">
        ✔ Vercel Queues connected for async ingestion
      </AnimatedSpan>

      <TypingAnimation className="text-zinc-200">&gt; contextforge ingest --repo unravel</TypingAnimation>

      <AnimatedSpan className="text-zinc-500">
        ✔ Secret scanner passed — 0 leaks found
      </AnimatedSpan>

      <AnimatedSpan className="text-zinc-500">
        ✔ Chunked 1,204 files → embeddings stored
      </AnimatedSpan>

      <AnimatedSpan className="text-amber-400">
        <span>ℹ Reranker scored top-k candidates</span>
        <span className="pl-2 text-zinc-400">- semantic + symbol match</span>
      </AnimatedSpan>

      <TypingAnimation className="text-zinc-200">&gt; contextforge ask "how does ingestion handle retries?"</TypingAnimation>

      <AnimatedSpan className="text-amber-400">
        <span>ℹ Routing classifier: repo-shaped question</span>
      </AnimatedSpan>

      <AnimatedSpan className="text-zinc-500">
        ✔ Tool call: search_repo("ingestion retries")
      </AnimatedSpan>

      <AnimatedSpan className="text-zinc-500">
        ✔ Tool call: read_file(queue/worker.py)
      </AnimatedSpan>

      <AnimatedSpan className="text-amber-400">
        <span>ℹ Confidence: high (3/3 sources agree)</span>
      </AnimatedSpan>

      <TypingAnimation className="text-zinc-500">
        Agent loop ready. Ask a question about the repo.
      </TypingAnimation>
    </Terminal>
  );
}