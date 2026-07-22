import { RESPONSE_GRACE_DAYS, type PipelineStats } from '../lib/pipeline';

// Compact stats bar above the sheet. Ink-bordered blocks with hard shadows;
// figures in tabular Space Mono. The to-apply block is tangerine to anchor the
// eye on "what's next".
export function PipelineStrip({ stats }: { stats: PipelineStats }) {
  const rateMeasurable = stats.responseRate != null;
  const rate = rateMeasurable ? `${Math.round(stats.responseRate! * 100)}%` : '—';

  const cells: {
    label: string;
    value: string;
    accent?: boolean;
    title?: string;
    hint?: string;
  }[] = [
    { label: 'To apply', value: String(stats.toApply), accent: true },
    { label: 'Applied this week', value: String(stats.appliedThisWeek) },
    { label: 'In interview', value: String(stats.interviewing) },
    {
      label: 'Response rate',
      value: rate,
      // Explain the denominator rather than showing a bare, demoralising 0%.
      title: rateMeasurable
        ? `Replies from ${stats.responseEligible} application${stats.responseEligible === 1 ? '' : 's'} sent over ${RESPONSE_GRACE_DAYS}+ days ago.`
        : `No applications are older than ${RESPONSE_GRACE_DAYS} days yet — too early to measure.`,
      hint: rateMeasurable ? `of ${stats.responseEligible} eligible` : 'too early to tell',
    },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {cells.map((c) => (
        <div
          key={c.label}
          title={c.title}
          className={`min-w-[9rem] flex-1 border-[3px] border-border px-4 py-3 shadow-sm ${
            c.accent ? 'bg-accent text-accent-ink' : 'bg-surface text-ink'
          }`}
        >
          <div className="font-mono text-3xl font-bold tabular-nums">{c.value}</div>
          <div className="mt-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-2">
            {c.label}
          </div>
          {c.hint && (
            <div className="mt-0.5 font-mono text-[10px] normal-case tracking-normal text-ink-2/80">
              {c.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
