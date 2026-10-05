"use client";

import { useMemo, useState } from "react";
import {  RefreshCw, Search } from "lucide-react";
import { Repo, RepoRow } from "./RepoRow";
import { Card } from "./Panel";

type Props = {
  repos: Repo[];
  refreshing: boolean;
  onRefresh: () => void;
  onIndex: (r: Repo) => void;
};

export default function RepoList({ repos, refreshing, onRefresh, onIndex }: Props) {
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return repos;
    return repos.filter(
      (r) => r.name.toLowerCase().includes(s) || r.description?.toLowerCase().includes(s)
    );
  }, [q, repos]);

  return (
    <Card
      title="Your repositories"
      meta={String(repos.length)}
      action={
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[#A39B90] outline-none transition-colors hover:bg-[#211E1B] hover:text-[#ECE7DF] focus-visible:ring-2 focus-visible:ring-[#F5A524] disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh from GitHub
        </button>
      }
    >
      <div className="sticky top-0 z-10 border-b border-[#2B2723] bg-[#181614] p-3">
        <label className="flex items-center gap-2 rounded-lg border border-[#2B2723] bg-[#121110] px-3 py-2 focus-within:border-[#F5A524]/60">
          <Search className="h-4 w-4 shrink-0 text-[#6F675D]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search repositories"
            className="w-full bg-transparent text-sm text-[#ECE7DF] outline-none placeholder:text-[#6F675D]"
          />
        </label>
      </div>

      {refreshing ? (
        <ul>
          {[0, 1, 2, 3, 4].map((i) => (
            <li
              key={i}
              className="flex animate-pulse items-center gap-4 border-b border-[#2B2723] px-5 py-3.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="h-3.5 w-1/2 rounded bg-[#211E1B]" />
                <div className="mt-2 h-3 w-3/4 rounded bg-[#211E1B]" />
                <div className="mt-2 h-3 w-1/4 rounded bg-[#211E1B]" />
              </div>
              <div className="h-7 w-14 rounded-md bg-[#211E1B]" />
            </li>
          ))}
        </ul>
      ) : shown.length > 0 ? (
        <ul>
          {shown.map((r) => (
            <RepoRow key={r.id} repo={r} onIndex={onIndex} />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-12 text-center text-sm text-[#6F675D]">
          {q ? `No repositories match "${q}".` : "No repositories found on this GitHub account."}
        </p>
      )}
    </Card>
  );
}