import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Job, JobStatus } from '../types/types';
import { JOB_STATUSES, STATUS_LABELS } from '../types/types';
import { db } from '../lib/db/db';
import { formatDate } from '../lib/format';
import { scoreChipClass } from '../lib/scoreColor';
import { useScreenshotQueue } from '../lib/screenshotQueue';
import { hasApiKey } from '../lib/api/client';
import { isStale, rescoreAllStale, scoreOne } from '../lib/scoreActions';
import { computeStats, isNoResponse } from '../lib/pipeline';
import { setJobStatus } from '../lib/statusChange';
import { downloadCsv } from '../lib/csv';
import { loadSampleData, clearAllData } from '../lib/sampleData';
import { Button, Chip, StatusBadge, TextInput, cx } from '../components/ui/primitives';
import { ConfirmDialog } from '../components/ui/overlays';
import { AddJobForm } from '../components/AddJobForm';
import { JobDetailPanel } from '../components/JobDetailPanel';
import { ScreenshotReview } from '../components/ScreenshotReview';
import { PipelineStrip } from '../components/PipelineStrip';

// ---------------------------------------------------------------------------
// Column model
// ---------------------------------------------------------------------------

type ColumnKey =
  | 'company'
  | 'roleTitle'
  | 'status'
  | 'matchScore'
  | 'dateAdded'
  | 'dateApplied'
  | 'location'
  | 'salaryBand'
  | 'contact';

interface Column {
  key: ColumnKey;
  label: string;
  sortValue: (j: Job) => string | number;
}

const COLUMNS: Column[] = [
  { key: 'company', label: 'Company', sortValue: (j) => j.company.toLowerCase() },
  { key: 'roleTitle', label: 'Role', sortValue: (j) => j.roleTitle.toLowerCase() },
  { key: 'status', label: 'Status', sortValue: (j) => JOB_STATUSES.indexOf(j.status) },
  { key: 'matchScore', label: 'Match', sortValue: (j) => j.matchScore ?? -1 },
  { key: 'dateAdded', label: 'Added', sortValue: (j) => j.dateAdded },
  { key: 'dateApplied', label: 'Applied', sortValue: (j) => j.dateApplied ?? '' },
  { key: 'location', label: 'Location', sortValue: (j) => (j.location ?? '').toLowerCase() },
  { key: 'salaryBand', label: 'Salary', sortValue: (j) => j.salaryBand ?? '' },
  { key: 'contact', label: 'Contact', sortValue: (j) => (j.contactName ?? j.contactEmail ?? '').toLowerCase() },
];

const DEFAULT_VISIBLE: ColumnKey[] = COLUMNS.map((c) => c.key);

// ---------------------------------------------------------------------------

function ScoreCell({ job, currentResumeVersion }: { job: Job; currentResumeVersion?: number }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Unscored: offer a one-click "Score" right in the cell (needs a key + a
  // saved resume). Clicking must not open the row's detail drawer.
  if (job.matchScore == null) {
    if (!hasApiKey()) return <span className="text-ink-2/50">—</span>;
    return (
      <button
        title={err ?? 'Score this job against your saved resume'}
        onClick={(e) => {
          e.stopPropagation();
          if (busy) return;
          setBusy(true);
          setErr(null);
          scoreOne(job)
            .catch((x) => setErr(x instanceof Error ? x.message : String(x)))
            .finally(() => setBusy(false));
        }}
        className={cx(
          'rounded-full border-2 border-border px-2.5 py-0.5 text-xs font-bold transition-colors',
          err ? 'bg-yellow text-ink' : 'bg-surface text-ink hover:bg-accent hover:text-accent-ink',
        )}
      >
        {busy ? 'Scoring…' : err ? 'needs resume' : 'Score'}
      </button>
    );
  }

  const stale =
    currentResumeVersion != null && job.scoredAgainstResumeVersion !== currentResumeVersion;
  return (
    <span
      title={stale ? 'Scored against an older resume' : undefined}
      className={cx(
        'inline-flex min-w-[2.75rem] justify-center rounded-full border-2 border-border px-2 py-0.5 font-mono text-xs font-bold tabular-nums',
        stale ? 'bg-surface-2 text-ink-2' : scoreChipClass(job.matchScore),
      )}
    >
      {job.matchScore}
      {stale && '*'}
    </span>
  );
}

export function SheetView() {
  const jobs = useLiveQuery(() => db.jobs.toArray(), []) ?? [];
  const resume = useLiveQuery(() => db.resume.get('base'), []);

  // Open onto "what should I apply to next".
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('to_apply');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<ColumnKey>('dateAdded');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [visible, setVisible] = useState<ColumnKey[]>(DEFAULT_VISIBLE);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState<string | undefined>(undefined);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { items, addImages, removeItem, reviewItem, pendingCount } = useScreenshotQueue();
  const failedItems = items.filter((i) => i.status === 'rejected' || i.status === 'failed');

  const [rescoring, setRescoring] = useState(false);
  const [includeNonToApply, setIncludeNonToApply] = useState(false);

  const staleCount = useMemo(
    () =>
      jobs.filter(
        (j) => isStale(j, resume?.version) && (includeNonToApply || j.status === 'to_apply'),
      ).length,
    [jobs, resume?.version, includeNonToApply],
  );

  const onRescoreAll = async () => {
    if (rescoring || staleCount === 0) return;
    setRescoring(true);
    try {
      await rescoreAllStale({ includeNonToApply });
    } catch (e) {
      console.warn('Rescore-all failed:', e);
    } finally {
      setRescoring(false);
    }
  };

  // The to_apply view defaults to score descending — "what should I apply to
  // next." Runs on entering the filter; the user can re-sort afterward.
  useEffect(() => {
    if (statusFilter === 'to_apply') {
      setSortKey('matchScore');
      setSortDir('desc');
    }
  }, [statusFilter]);

  // Paste-from-clipboard intake: Ctrl/Cmd+V anywhere on the sheet when no input
  // is focused. Images → screenshot queue; a substantial block of text → the
  // Add-job sorter (paste the whole JD and it fills the fields for you).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const images = Array.from(e.clipboardData?.items ?? [])
        .filter((it) => it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter((f): f is File => f !== null);
      if (images.length > 0) {
        e.preventDefault();
        addImages(images);
        return;
      }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      // Threshold avoids hijacking small incidental pastes; a JD is long.
      if (text.trim().length > 40) {
        e.preventDefault();
        setAddText(text);
        setAddOpen(true);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addImages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = jobs;
    if (statusFilter !== 'all') rows = rows.filter((j) => j.status === statusFilter);
    if (q) {
      rows = rows.filter((j) =>
        [j.company, j.roleTitle, j.notes].some((f) => f.toLowerCase().includes(q)),
      );
    }
    const col = COLUMNS.find((c) => c.key === sortKey)!;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue(a);
      const bv = col.sortValue(b);
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [jobs, statusFilter, search, sortKey, sortDir]);

  const counts = useMemo(() => {
    const c = new Map<JobStatus, number>();
    for (const j of jobs) c.set(j.status, (c.get(j.status) ?? 0) + 1);
    return c;
  }, [jobs]);

  const stats = useMemo(() => computeStats(jobs), [jobs]);

  const onSort = (key: ColumnKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'matchScore' || key.startsWith('date') ? 'desc' : 'asc');
    }
  };

  const toggleColumn = (key: ColumnKey) =>
    setVisible((v) => (v.includes(key) ? v.filter((k) => k !== key) : [...v, key]));

  const shownColumns = COLUMNS.filter((c) => visible.includes(c.key));

  const cellContent = (job: Job, key: ColumnKey) => {
    switch (key) {
      case 'company':
        return <span className="font-medium text-ink">{job.company}</span>;
      case 'roleTitle':
        return job.roleTitle;
      case 'status':
        return (
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={job.status} />
            {isNoResponse(job) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void setJobStatus(job, 'ghosted');
                }}
                title="No status change for 14+ days. Click to mark as ghosted."
                className="rounded-full border-2 border-border bg-yellow px-2 py-0.5 text-[11px] font-bold text-ink hover:bg-status-ghosted hover:text-white"
              >
                no response → ghost
              </button>
            )}
          </span>
        );
      case 'matchScore':
        return <ScoreCell job={job} currentResumeVersion={resume?.version} />;
      case 'dateAdded':
        return formatDate(job.dateAdded);
      case 'dateApplied':
        return formatDate(job.dateApplied);
      case 'location':
        return job.location ?? '—';
      case 'salaryBand':
        return job.salaryBand ?? '—';
      case 'contact':
        return job.contactName ?? job.contactEmail ?? '—';
    }
  };

  return (
    <div
      className={cx('min-h-[70vh] px-6 py-5', dragOver && 'outline-dashed outline-[3px] outline-accent -outline-offset-4')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        addImages(Array.from(e.dataTransfer.files));
      }}
    >
      {/* Pipeline stats */}
      <div className="mb-4">
        <PipelineStrip stats={stats} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
          All <span className="opacity-60">{jobs.length}</span>
        </Chip>
        {JOB_STATUSES.map((s) => (
          <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {STATUS_LABELS[s]} <span className="opacity-60">{counts.get(s) ?? 0}</span>
          </Chip>
        ))}
        <div className="flex-1" />
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, role, notes…"
          className="!w-64"
        />
        <div className="relative">
          <Button variant="secondary" size="md" onClick={() => setColumnMenuOpen((o) => !o)}>
            Columns
          </Button>
          {columnMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setColumnMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1.5 w-48 border-[3px] border-border bg-surface p-2 shadow-md">
                {COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={visible.includes(c.key)}
                      onChange={() => toggleColumn(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        {hasApiKey() && staleCount > 0 && (
          <label className="flex items-center gap-1 text-xs text-ink-2" title="Include applied, rejected, etc.">
            <input
              type="checkbox"
              checked={includeNonToApply}
              onChange={(e) => setIncludeNonToApply(e.target.checked)}
            />
            all
          </label>
        )}
        {hasApiKey() && staleCount > 0 && (
          <Button variant="secondary" onClick={onRescoreAll} disabled={rescoring}>
            {rescoring ? 'Rescoring…' : `Rescore ${staleCount} stale`}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          title={hasApiKey() ? 'File picker, drag-drop, or Ctrl+V a screenshot' : 'Requires VITE_GEMINI_API_KEY in .env.local'}
        >
          Add from screenshot
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addImages(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          onClick={() => downloadCsv(jobs)}
          disabled={jobs.length === 0}
          title="Export the whole sheet as CSV"
        >
          Export CSV
        </Button>
        {jobs.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => setConfirmClear(true)}
            title="Delete everything in this browser"
          >
            Clear data
          </Button>
        )}
        <Button
          onClick={() => {
            setAddText(undefined);
            setAddOpen(true);
          }}
        >
          + Add job
        </Button>
      </div>

      {/* Extraction queue indicator + errors */}
      {(pendingCount > 0 || failedItems.length > 0) && (
        <div className="mt-3 space-y-1.5">
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 border-[3px] border-border bg-surface px-3 py-2 text-xs font-medium text-ink shadow-sm">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Extracting {pendingCount} screenshot{pendingCount > 1 ? 's' : ''}…
            </div>
          )}
          {failedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between border-[3px] border-border bg-red px-3 py-2 text-xs font-bold text-white shadow-sm"
            >
              <span>{item.errorMessage}</span>
              <button className="ml-3 font-bold underline" onClick={() => removeItem(item.id)}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="mt-4 overflow-x-auto border-[3px] border-border bg-surface shadow-md">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-ink text-left">
              {shownColumns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  className="cursor-pointer select-none whitespace-nowrap px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-wide text-bg hover:text-accent"
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="ml-1 text-accent">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={shownColumns.length} className="px-4 py-12 text-center">
                  {jobs.length === 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-ink-2">
                        No jobs yet. Add one manually, paste a job description anywhere here, or drop
                        a screenshot.
                      </p>
                      <Button variant="secondary" size="sm" onClick={() => void loadSampleData()}>
                        Load sample data
                      </Button>
                    </div>
                  ) : (
                    <span className="text-sm text-ink-2">Nothing matches the current filters.</span>
                  )}
                </td>
              </tr>
            )}
            {filtered.map((job) => (
              <tr
                key={job.id}
                onClick={() => setDetailId(job.id)}
                className="cursor-pointer border-t-2 border-border/15 first:border-t-0 hover:bg-surface-2"
              >
                {shownColumns.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-4 py-2.5 text-ink-2">
                    {cellContent(job, c.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddJobForm
        open={addOpen}
        initialText={addText}
        onClose={() => {
          setAddOpen(false);
          setAddText(undefined);
        }}
      />
      <JobDetailPanel jobId={detailId} onClose={() => setDetailId(null)} />
      {reviewItem?.result && (
        <ScreenshotReview
          key={reviewItem.id}
          blob={reviewItem.blob}
          result={reviewItem.result}
          onDone={() => removeItem(reviewItem.id)}
          onCancel={() => removeItem(reviewItem.id)}
        />
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear all data?"
        message="This permanently deletes every job, your resume, and stored screenshots from this browser. Export a CSV first if you want a backup."
        confirmLabel="Clear everything"
        onConfirm={() => {
          void clearAllData();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
