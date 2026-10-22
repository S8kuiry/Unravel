import Link from "next/link";
import { Check, CheckCircle2,  Globe, Loader2, Lock } from "lucide-react";

// Shape of one repository from your backend (GitHub list plus your own index status)
export type Repo = {
  id: number;
  owner: string;
  name: string;
  private: boolean;
  description: string | null;
  language: string | null;
  pushedAt: string; // ISO date from GitHub
  access: "owner" | "collaborator" | "org";
  indexed: "none" | "indexing" | "ready"; // set by the backend once the repo page has prepared it
  default_branch: string | null;
  html_url: string | null;

};

const LANG: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572a5",
  Go: "#00add8", Rust: "#dea584", Shell: "#5fa04e", Java: "#b07219",
};

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const units: [number, string][] = [[31536000, "year"], [2592000, "month"], [86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [n, label] of units) {
    if (s >= n) {
      const v = Math.floor(s / n);
      return `${v} ${label}${v > 1 ? "s" : ""} ago`;
    }
  }
  return "just now";
}

// compact = used inside a group that already shows the owner, so the prefix and badge are dropped
export function RepoRow({
  repo,
  compact = false,
  isOpened = false }: { repo: Repo; compact?: boolean, isOpened?: boolean; }) {
  const shared = repo.access !== "owner";
  const Vis = repo.private ? Lock : Globe;

  return (
    <li className="group relative flex items-center gap-4 border-b border-[#2B2723] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-[#211E1B]/60">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* The ::after layer stretches this link over the whole row, so the row is one big click target */}
          <Link
            href={`/dashboard/repo/${repo.name}?owner=${encodeURIComponent(repo.owner)}`}
            className="truncate text-sm text-[#ECE7DF] outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F5A524]"
          >
            {shared && !compact && <span className="text-[#6F675D]">{repo.owner}/</span>}
            <span className="font-medium">{repo.name}</span>
          </Link>
          <Vis className="h-3.5 w-3.5 shrink-0 text-[#6F675D]" aria-label={repo.private ? "Private" : "Public"} />
          {shared && !compact && (
            <span className="shrink-0 rounded-full border border-[#2B2723] px-2 py-0.5 text-[11px] text-[#A39B90]">
              {repo.access === "org" ? "Organization" : "Collaborator"}
            </span>
          )}
        </div>
        {repo.description && <p className="mt-0.5 truncate text-xs text-[#A39B90]">{repo.description}</p>}
        <p className="mt-1 flex items-center gap-3 text-xs text-[#6F675D]">
          {repo.language && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LANG[repo.language] ?? "#6F675D" }} />
              {repo.language}
            </span>
          )}
          <span>Updated {timeAgo(repo.pushedAt)}</span>
        </p>
      </div>

      {repo.indexed === "ready" && (
        <span className="hidden shrink-0 items-center gap-1.5 text-xs text-[#A39B90] sm:flex">
          <Check className="h-3.5 w-3.5 text-[#F5A524]" /> Ready
        </span>
      )}
      {repo.indexed === "indexing" && (
        <span className="hidden shrink-0 items-center gap-1.5 text-xs text-[#F5A524] sm:flex">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing
        </span>
      )}

      {/* Looks like a button, but the stretched link above does the navigating */}
      {isOpened ? (
        <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Opened
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#F5A524]/40 px-3 py-1.5 text-xs font-medium text-[#F5A524] transition-colors group-hover:bg-[#F5A524]/10">
          Open
        </span>
      )}
    </li>
  );
}