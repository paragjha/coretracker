import type { PipelineStats } from '../lib/pipeline';

// Compact stats bar above the sheet. Ink-bordered blocks with hard shadows;
// figures in tabular Space Mono. The to-apply block is tangerine to anchor the
// eye on "what's next".
export function PipelineStrip({ stats }: { stats: PipelineStats }) {
  const rate = stats.responseRate == null ? '—' : `${Math.round(stats.responseRate * 100)}%`;

  const cells: { label: string; value: string; accent?: boolean }[] = [
    { label: 'To apply', value: String(stats.toApply), accent: true },
    { label: 'Applied this week', value: String(stats.appliedThisWeek) },
    { label: 'In interview', value: String(stats.interviewing) },
    { label: 'Response rate', value: rate },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {cells.map((c) => (
        <div
          key={c.label}
          className={`min-w-[9rem] flex-1 border-[3px] border-border px-4 py-3 shadow-sm ${
            c.accent ? 'bg-accent text-accent-ink' : 'bg-surface text-ink'
          }`}
        >
          <div className="font-mono text-3xl font-bold tabular-nums">{c.value}</div>
          <div className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-2">
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}
