"use client";

import type { ReactNode } from "react";
import { Separator } from "react-resizable-panels";

// A titled card whose body scrolls on its own. Every workspace panel uses this.
export function Card({
  title, meta, action, children,
}: { title: string; meta?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#2B2723] bg-[#181614]">
      <header className="flex shrink-0 items-center gap-3 border-b border-[#2B2723] px-5 py-3.5">
        <h2 className="text-sm font-medium text-[#ECE7DF]">{title}</h2>
        {meta && <span className="text-xs text-[#6F675D]">{meta}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

// Drag handle between panels.
export function Handle({ direction }: { direction: "horizontal" | "vertical" }) {
  const horizontal = direction === "horizontal";
  return (
    <Separator
      className={`group relative flex shrink-0 items-center justify-center outline-none ${
        horizontal ? "w-3 cursor-col-resize" : "h-3 cursor-row-resize"
      }`}
    >
      <span
        className={`rounded-full bg-[#2B2723] transition-colors group-hover:bg-[#F5A524] group-focus-visible:bg-[#F5A524] ${
          horizontal ? "h-10 w-0.5" : "h-0.5 w-10"
        }`}
      />
    </Separator>
  );
}

export function GithubMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}