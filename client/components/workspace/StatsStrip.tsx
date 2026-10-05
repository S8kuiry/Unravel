import { timeAgo } from "./RepoRow";

type Props = {
  total: number;
  own: number;
  shared: number;
  indexed: number;
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

export default function StatsStrip({ total, own, shared, indexed, orgs, refreshedAt }: Props) {
  const pct = total ? Math.round((indexed / total) * 100) : 0;

  return (
    // gap-px on a hairline-colored background draws the dividers at any column count
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#2B2723] bg-[#2B2723] lg:grid-cols-4">
      <Cell label="Repositories" value={String(total)} hint={`${own} yours, ${shared} shared`} />

      <Cell label="Ready to ask" value={`${indexed} of ${total}`} hint="indexed">
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#2B2723]">
          <div className="h-full rounded-full bg-[#F5A524] transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </Cell>

      <Cell
        label="Organizations"
        value={String(orgs.length)}
        hint={orgs.length ? orgs.join(", ") : "None found"}
        title={orgs.join(", ")}
      />

      <Cell label="Last refreshed" value={timeAgo(refreshedAt)} />
    </dl>
  );
}