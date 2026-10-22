"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { Repo, RepoRow } from "./RepoRow";
import { Card } from "../Panel";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";

type Props = {
  repos: Repo[];
  refreshing: boolean;
  currentPage: number;
  hasNextPage: boolean;
  // onRefresh: () => void;
};

export default function RepoList({ repos, refreshing, currentPage, hasNextPage }: Props) {
  const [q, setQ] = useState("");
  const { user } = useAuth()
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Inside RepoList:
  const queryClient = useQueryClient();

  const openedRepos = queryClient.getQueryData<Repo[]>([
    "opened-repos",
    user?.uid,
  ]);

  const openedRepoNames = useMemo(
    () => new Set(openedRepos?.map((repo) => repo.name) ?? []),
    [openedRepos]
  );

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(newPage));
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const paginationHeader = (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#A39B90]">Page {currentPage}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage <= 1 || refreshing}
          aria-label="Previous page"
          className="grid h-7 w-7 place-items-center rounded-md border border-[#2B2723] bg-[#181614] text-[#ECE7DF] transition-colors hover:bg-[#211E1B] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={!hasNextPage || refreshing}
          aria-label="Next page"
          className="grid h-7 w-7 place-items-center rounded-md border border-[#2B2723] bg-[#181614] text-[#ECE7DF] transition-colors hover:bg-[#211E1B] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

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
      action={paginationHeader}

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
        <ul aria-hidden="true">
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
          {shown.map((repo) => (
            <RepoRow
              key={repo.id}
              repo={repo}
              isOpened={openedRepoNames.has(repo.name)}
            />
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