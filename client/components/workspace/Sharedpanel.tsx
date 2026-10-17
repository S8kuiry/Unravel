
"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Search } from "lucide-react";
import { Card } from "../Panel";
import { RepoRow, type Repo } from "./RepoRow";

// GitHub serves any user's or organization's avatar at github.com/<login>.png
function OwnerAvatar({ owner }: { owner: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#2B2723] text-[11px] font-medium text-[#ECE7DF]">
        {owner.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://github.com/${owner}.png?size=64`}
      alt=""
      onError={() => setFailed(true)}
      className="h-7 w-7 shrink-0 rounded-full bg-[#2B2723] object-cover"
    />
  );
}

// Same shape as the real content (group header, then rows), so nothing jumps when data arrives
function Skeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      {[0, 1].map((g) => (
        <div key={g}>
          <div className="flex items-center gap-3 border-b border-[#2B2723] px-5 py-3">
            <div className="h-7 w-7 rounded-full bg-[#211E1B]" />
            <div className="h-3.5 w-28 rounded bg-[#211E1B]" />
          </div>
          {[0, 1].map((r) => (
            <div key={r} className="flex items-center gap-4 border-b border-[#2B2723] px-5 py-4">
              <div className="flex-1 space-y-2.5">
                <div className="h-3.5 w-1/2 rounded bg-[#211E1B]" />
                <div className="h-3 w-3/4 rounded bg-[#211E1B]" />
                <div className="h-3 w-1/3 rounded bg-[#211E1B]" />
              </div>
              <div className="h-8 w-16 rounded-md bg-[#211E1B]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const latestPush = (list: Repo[]) => Math.max(...list.map((r) => new Date(r.pushedAt).getTime()));

export default function SharedPanel({ repos, loading }: { repos: Repo[]; loading: boolean }) {
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const searching = q.trim().length > 0;

  // Filter, group by owner, and put the most recently pushed-to owner first
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const matches = s
      ? repos.filter((r) => `${r.owner}/${r.name} ${r.description ?? ""}`.toLowerCase().includes(s))
      : repos;
    const byOwner = new Map<string, Repo[]>();
    for (const r of matches) byOwner.set(r.owner, [...(byOwner.get(r.owner) ?? []), r]);
    return Array.from(byOwner.entries()).sort((a, b) => latestPush(b[1]) - latestPush(a[1]));
  }, [q, repos]);

  return (
    <Card title="Shared with you" meta={loading ? undefined : String(repos.length)}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 border-b border-[#2B2723] bg-[#181614] p-3">
            <label className="flex items-center gap-2 rounded-lg border border-[#2B2723] bg-[#121110] px-3 py-2 focus-within:border-[#F5A524]/60">
              <Search className="h-4 w-4 shrink-0 text-[#6F675D]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search shared repositories"
                className="w-full bg-transparent text-sm text-[#ECE7DF] outline-none placeholder:text-[#6F675D]"
              />
            </label>
          </div>

          {loading ? (
            <Skeleton />
          ) : groups.length > 0 ? (
            groups.map(([owner, items]) => {
              const isOpen = searching || !closed[owner]; // while searching, show every match
              const isOrg = items[0].access === "org";
              return (
                <section key={owner}>
                  <button
                    onClick={() => setClosed((c) => ({ ...c, [owner]: !c[owner] }))}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 border-b border-[#2B2723] bg-[#181614] px-5 py-3 text-left outline-none transition-colors hover:bg-[#211E1B]/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F5A524]"
                  >
                    <OwnerAvatar owner={owner} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#ECE7DF]">{owner}</span>
                      <span className="block text-xs text-[#6F675D]">{isOrg ? "Organization" : "Collaborator"}</span>
                    </span>
                    <span className="rounded-full bg-[#211E1B] px-2 py-0.5 text-[11px] text-[#A39B90]">{items.length}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-[#6F675D] transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                  </button>
                  {isOpen && (
                    <ul>
                      {items.map((r) => (
                        <RepoRow key={r.id} repo={r} compact />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })
          ) : (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-[#A39B90]">{searching ? `No matches for "${q}"` : "Nothing shared with you yet"}</p>
              {!searching && (
                <p className="mt-1 text-xs text-[#6F675D]">
                  Repositories from collaborators and organizations will appear here.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="shrink-0 border-t border-[#2B2723] px-5 py-3 text-xs leading-relaxed text-[#6F675D]">
          Missing an organization&apos;s repositories? It may need to approve Unravel.{" "}
          <a
            href="https://github.com/settings/applications"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#A39B90] underline-offset-2 hover:text-[#F5A524] hover:underline"
          >
            Review access on GitHub <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>
    </Card>
  );
}