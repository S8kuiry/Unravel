import { timeAgo } from "./RepoRow";

type Props = {
  total: number;
  own: number;
  shared: number;
  orgs: string[];
  refreshedAt: string; // ISO date
};

function Cell({
  label, value, hint, title, children,
}: { label: string; value: string; hint?: string; title?: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-[#181614] px-4 py-3" title={title}>
      <dt className="text-xs text-[#6F675D]">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-2 text-sm text-[#ECE7DF]">
        <span className="shrink-0 font-medium tabular-nums">{value}</span>
        {hint && <span className="min-w-0 truncate text-xs text-[#A39B90]">{hint}</span>}
      </dd>
      {children}
    </div>
  );
}

export default function StatsStrip({ total, own, shared,  orgs, refreshedAt }: Props) {

  return (
    // gap-px on a hairline-colored background draws the dividers at any column count
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#2B2723] bg-[#2B2723] lg:grid-cols-4">
      <Cell label="Your Repositories" value={String(own)} hint="personal" />

      <Cell label="Total Repos Fetched" value={String(total)} hint="all repositories" />

      <Cell
  label="Shared Repos & Organizations"
  value={String(shared + orgs.length)}
  hint={orgs.length ? `${orgs.length} org${orgs.length > 1 ? "s" : ""}` : "None"}
  title={orgs.join(", ")}
/>

      <Cell label="Last refreshed" value={timeAgo(refreshedAt)} />
    </dl>
  );
}