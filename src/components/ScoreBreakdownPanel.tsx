import type { Job } from '../types/types';
import { scoreTextClass } from '../lib/scoreColor';
import { cx } from './ui/primitives';

const EXP_FIT_LABEL = {
  under: 'Under-qualified',
  match: 'Experience matches',
  over: 'Over-qualified',
} as const;

// Row-detail scoring breakdown. Missing skills double as tailoring notes: the
// list of things to emphasize or add when adapting the resume for this job.
export function ScoreBreakdownPanel({ job, stale }: { job: Job; stale: boolean }) {
  if (job.matchScore == null || !job.scoreBreakdown) return null;
  const { matchedSkills, missingSkills, experienceFit, verdict } = job.scoreBreakdown;

  return (
    <div className="border-[3px] border-border bg-surface p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span
            className={cx('font-mono text-4xl font-bold tabular-nums', scoreTextClass(job.matchScore))}
          >
            {job.matchScore}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-wide text-ink-2">/ 100 match</span>
        </div>
        {stale && (
          <span
            className="rounded-full border-2 border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-ink-2"
            title="Scored against an older resume"
          >
            stale
          </span>
        )}
      </div>

      {verdict && <p className="mt-2.5 text-sm text-ink">{verdict}</p>}

      <p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-2">
        {EXP_FIT_LABEL[experienceFit]}
      </p>

      {matchedSkills.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-2">
            Matched skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {matchedSkills.map((s) => (
              <span
                key={s}
                className="rounded-full border-2 border-border bg-green px-2 py-0.5 text-xs font-bold text-white"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {missingSkills.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-2">
            Missing skills — tailoring notes
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missingSkills.map((s) => (
              <span
                key={s}
                className="rounded-full border-2 border-border bg-red px-2 py-0.5 text-xs font-bold text-white"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
