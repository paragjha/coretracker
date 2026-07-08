import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Job, JobStatus } from '../types/types';
import { JOB_STATUSES, STATUS_LABELS } from '../types/types';
import { db } from '../lib/db/db';
import { setJobStatus } from '../lib/statusChange';
import { daysSince } from '../lib/format';
import { scoreChipClass } from '../lib/scoreColor';
import { isNoResponse } from '../lib/pipeline';
import { cx } from '../components/ui/primitives';
import { JobDetailPanel } from '../components/JobDetailPanel';

// Columns collapsed by default so dead applications don't eat screen space.
const COLLAPSED_BY_DEFAULT: JobStatus[] = ['rejected', 'ghosted'];

function sortColumn(status: JobStatus, jobs: Job[]): Job[] {
  const copy = [...jobs];
  if (status === 'to_apply') {
    // Highest score first; unscored last. Same priority logic as the sheet.
    return copy.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
  }
  if (status === 'applied') {
    // Oldest application first, so stale applications surface at the top.
    return copy.sort((a, b) => (a.dateApplied ?? '').localeCompare(b.dateApplied ?? ''));
  }
  // Most recent status change first.
  return copy.sort((a, b) => b.statusChangedAt.localeCompare(a.statusChangedAt));
}

function Card({
  job,
  currentResumeVersion,
  onOpen,
  onDragStart,
}: {
  job: Job;
  currentResumeVersion?: number;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const days = daysSince(job.statusChangedAt);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className="cursor-pointer border-[3px] border-border bg-surface p-3 shadow-sm transition-transform duration-100 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-md active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{job.company || 'Untitled'}</p>
          <p className="truncate text-xs text-ink-2">{job.roleTitle}</p>
        </div>
        {job.matchScore != null && (
          <span
            className={cx(
              'shrink-0 rounded-full border-2 border-border px-2 py-0.5 font-mono text-xs font-bold tabular-nums',
              currentResumeVersion != null && job.scoredAgainstResumeVersion !== currentResumeVersion
                ? 'bg-surface-2 text-ink-2'
                : scoreChipClass(job.matchScore),
            )}
          >
            {job.matchScore}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-ink-2">
        <span>
          {days}d in {STATUS_LABELS[job.status].toLowerCase()}
        </span>
        {isNoResponse(job) && (
          <span className="rounded-full border border-border bg-yellow px-1.5 py-0.5 font-bold text-ink">
            no response
          </span>
        )}
      </div>
    </div>
  );
}

export function KanbanView() {
  const jobs = useLiveQuery(() => db.jobs.toArray(), []) ?? [];
  const resume = useLiveQuery(() => db.resume.get('base'), []);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<JobStatus>>(new Set(COLLAPSED_BY_DEFAULT));
  const [dragOverCol, setDragOverCol] = useState<JobStatus | null>(null);

  const byStatus = useMemo(() => {
    const map = new Map<JobStatus, Job[]>();
    for (const s of JOB_STATUSES) map.set(s, []);
    for (const job of jobs) map.get(job.status)?.push(job);
    for (const s of JOB_STATUSES) map.set(s, sortColumn(s, map.get(s)!));
    return map;
  }, [jobs]);

  const toggleCollapse = (status: JobStatus) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(status) ? next.delete(status) : next.add(status);
      return next;
    });

  // The dragged job id rides in dataTransfer (available synchronously on drop),
  // so status changes don't depend on React state flushing mid-drag.
  const onDrop = async (e: React.DragEvent, status: JobStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    const jobId = e.dataTransfer.getData('text/plain');
    const job = jobs.find((j) => j.id === jobId);
    // Exact same status-change logic as the sheet dropdown, incl. auto-setting
    // dateApplied when dropped into Applied.
    if (job) await setJobStatus(job, status);
  };

  return (
    <div className="px-6 py-5">
      <div className="flex gap-3 overflow-x-auto pb-4">
        {JOB_STATUSES.map((status) => {
          const columnJobs = byStatus.get(status)!;
          const isCollapsed = collapsed.has(status);
          const unscored =
            status === 'to_apply'
              ? columnJobs.filter((j) => j.matchScore == null).length
              : 0;

          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(status);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDragOverCol(null);
              }}
              onDrop={(e) => onDrop(e, status)}
              className={cx(
                'flex w-72 shrink-0 flex-col border-[3px] bg-bg shadow-sm',
                dragOverCol === status ? 'border-accent' : 'border-border',
              )}
            >
              <button
                onClick={() => COLLAPSED_BY_DEFAULT.includes(status) && toggleCollapse(status)}
                className={cx(
                  'flex items-center justify-between border-b-[3px] border-border bg-ink px-3 py-2.5 text-left',
                  COLLAPSED_BY_DEFAULT.includes(status) && 'cursor-pointer hover:bg-black',
                )}
              >
                <span className="font-mono text-xs font-bold uppercase tracking-wide text-bg">
                  {STATUS_LABELS[status]}
                </span>
                <span className="flex items-center gap-2 font-mono text-xs text-bg">
                  {unscored > 0 && (
                    <span className="rounded-full border border-border bg-yellow px-1.5 py-0.5 text-[10px] font-bold text-ink" title="Unscored — score them">
                      {unscored} unscored
                    </span>
                  )}
                  <span className="tabular-nums font-bold">{columnJobs.length}</span>
                  {COLLAPSED_BY_DEFAULT.includes(status) && <span>{isCollapsed ? '▸' : '▾'}</span>}
                </span>
              </button>

              {!isCollapsed && (
                <div className="flex-1 space-y-2 p-2">
                  {columnJobs.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-ink-2/60">Empty</p>
                  ) : (
                    columnJobs.map((job) => (
                      <Card
                        key={job.id}
                        job={job}
                        currentResumeVersion={resume?.version}
                        onOpen={() => setDetailId(job.id)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', job.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <JobDetailPanel jobId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
