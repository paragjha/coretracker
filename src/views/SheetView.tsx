import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Job, JobStatus } from '../types/types';
import { JOB_STATUSES, STATUS_LABELS } from '../types/types';
import { db } from '../lib/db/db';
import { formatDate } from '../lib/format';
import { scoreChipClass } from '../lib/scoreColor';
import { useScreenshotQueue } from '../lib/screenshotQueue';
import { hasApiKey, QuotaExceededError } from '../lib/api/client';
import { looksLikeUrl } from '../lib/api/fetchJd';
import { isStale, rescoreAllStale, scoreOne } from '../lib/scoreActions';
import { computeStats, isNoResponse } from '../lib/pipeline';
import { setJobStatus } from '../lib/statusChange';
import { downloadCsv } from '../lib/csv';
import { loadSampleData, clearAllData } from '../lib/sampleData';
import { exportBackup, importBackup, shouldNudgeBackup, BackupParseError } from '../lib/backup';
import { usePendingDeletionIds } from '../lib/usePendingDeletions';
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
  const [err, setErr] = useState<{ label: string; detail: string } | null>(null);

  // Unscored: offer a one-click "Score" right in the cell (needs a key + a
  // saved resume). Clicking must not open the row's detail drawer.
  if (job.matchScore == null) {
    if (!hasApiKey()) return <span className="text-ink-2/50">—</span>;
    return (
      <button
        title={err?.detail ?? 'Click to score this job against your saved resume'}
        onClick={(e) => {
          e.stopPropagation();
          if (busy) return;
          setBusy(true);
          setErr(null);
          scoreOne(job)
            .catch((x) => {
              const detail = x instanceof Error ? x.message : String(x);
              // Label the actual cause — a quota block is not a missing resume.
              const label =
                x instanceof QuotaExceededError
                  ? 'quota — retry'
                  : /resume/i.test(detail)
                    ? 'needs resume'
                    : 'failed — retry';
              setErr({ label, detail });
            })
            .finally(() => setBusy(false));
        }}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-full border-2 border-border px-2.5 py-0.5 text-xs font-bold transition-colors',
          err ? 'bg-yellow text-ink' : 'bg-surface text-ink hover:bg-accent hover:text-accent-ink',
        )}
      >
        {busy && (
          <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-ink border-t-transparent" />
        )}
        {busy ? 'Scoring…' : (err?.label ?? 'Score')}
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

// The status pill is the fastest place to log a change — one click here beats
// open drawer → dropdown → close, and it keeps "Applied" dates honest.
function StatusCell({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="inline-flex items-center gap-2">
      <div className="relative inline-flex">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          title="Change status"
          aria-haspopup="menu"
          aria-expanded={open}
          className="rounded-full transition-transform hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <StatusBadge status={job.status} />
        </button>
        {open && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            />
            <div
              role="menu"
              className="absolute left-0 top-full z-20 mt-1.5 flex w-44 flex-col border-[3px] border-border bg-surface p-1 shadow-md"
            >
              {JOB_STATUSES.map((s) => (
                <button
                  key={s}
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    void setJobStatus(job, s);
                    setOpen(false);
                  }}
                  className={cx(
                    'px-2 py-1 text-left text-xs font-bold hover:bg-surface-2',
                    s === job.status && 'bg-accent-soft text-accent-ink',
                  )}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
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
    </div>
  );
}

export function SheetView() {
  const allJobs = useLiveQuery(() => db.jobs.toArray(), []) ?? [];
  const resume = useLiveQuery(() => db.resume.get('base'), []);
  // Rows mid-undo-window are hidden immediately even though the DB delete is
  // still pending — see lib/undoableDelete.ts.
  const pendingDeletionIds = usePendingDeletionIds();
  const jobs = useMemo(
    () => allJobs.filter((j) => !pendingDeletionIds.has(j.id)),
    [allJobs, pendingDeletionIds],
  );

  // Open onto "what should I apply to next".
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('to_apply');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<ColumnKey>('dateAdded');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [visible, setVisible] = useState<ColumnKey[]>(DEFAULT_VISIBLE);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState<string | undefined>(undefined);
  const [addUrl, setAddUrl] = useState<string | undefined>(undefined);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

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
    setBackupError(null);
    setBackupMessage(null);
    try {
      await rescoreAllStale({ includeNonToApply });
    } catch (e) {
      // Quota is the common failure here — say so plainly instead of a raw dump.
      setBackupError(
        e instanceof QuotaExceededError
          ? 'Scoring quota reached — the jobs scored so far are saved. Try the rest later.'
          : e instanceof Error
            ? e.message
            : 'Rescore failed.',
      );
    } finally {
      setRescoring(false);
    }
  };

  const onExportBackup = async () => {
    setBackupError(null);
    setBackupMessage(null);
    await exportBackup();
    setBackupMessage('Backup downloaded.');
  };

  const onImportBackupFile = async (file: File) => {
    setBackupError(null);
    setBackupMessage(null);
    try {
      const result = await importBackup(file);
      const parts = [`${result.jobsAdded} new`, `${result.jobsUpdated} updated`];
      if (result.resumeRestored) parts.push('resume restored');
      setBackupMessage(`Import complete — ${parts.join(', ')}.`);
    } catch (e) {
      setBackupError(e instanceof BackupParseError ? e.message : 'Import failed — check the file and try again.');
    }
  };

  const showBackupNudge = !nudgeDismissed && shouldNudgeBackup(jobs.length);

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
      // A bare link goes to the fetcher (the "WhatsApp the link to myself"
      // path); a long blob of prose goes to the sorter. The length threshold
      // avoids hijacking small incidental pastes.
      if (looksLikeUrl(text)) {
        e.preventDefault();
        setAddText(undefined);
        setAddUrl(text.trim());
        setAddOpen(true);
      } else if (text.trim().length > 40) {
        e.preventDefault();
        setAddUrl(undefined);
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
        return <StatusCell job={job} />;
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
          title="Export the whole sheet as CSV (spreadsheet-friendly, lossy)"
        >
          Export CSV
        </Button>
        <Button
          variant="secondary"
          onClick={() => void onExportBackup()}
          title="Full lossless backup — jobs, resume, screenshots (JSON)"
        >
          Export backup
        </Button>
        <Button
          variant="secondary"
          onClick={() => backupInputRef.current?.click()}
          title="Restore or merge from a backup JSON file"
        >
          Import backup
        </Button>
        <input
          ref={backupInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportBackupFile(f);
            e.target.value = '';
          }}
        />
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
            setAddUrl(undefined);
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

      {/* Backup feedback */}
      {(backupMessage || backupError) && (
        <div
          className={cx(
            'mt-3 flex items-center justify-between border-[3px] border-border px-3 py-2 text-xs font-bold shadow-sm',
            backupError ? 'bg-red text-white' : 'bg-surface text-ink',
          )}
        >
          <span>{backupError ?? backupMessage}</span>
          <button
            className="ml-3 underline"
            onClick={() => {
              setBackupMessage(null);
              setBackupError(null);
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Quiet backup nudge — enough data at stake, or overdue on cadence */}
      {showBackupNudge && (
        <div className="mt-3 flex items-center justify-between border-[3px] border-border bg-yellow px-3 py-2 text-xs font-bold text-ink shadow-sm">
          <span>Back up your data — it only lives in this browser.</span>
          <span className="flex items-center gap-3">
            <button className="underline" onClick={() => void onExportBackup()}>
              Back up now
            </button>
            <button className="underline" onClick={() => setNudgeDismissed(true)}>
              Dismiss
            </button>
          </span>
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
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-ink-2">Nothing matches the current filters.</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setStatusFilter('all');
                          setSearch('');
                        }}
                      >
                        Clear filters
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            )}
            {filtered.map((job) => (
              <tr
                key={job.id}
                onClick={() => setDetailId(job.id)}
                // Keyboard parity with the mouse: rows are focusable and open
                // on Enter/Space, so a job is reachable without a pointer.
                tabIndex={0}
                role="button"
                aria-label={`Open ${job.company} — ${job.roleTitle}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    // Ignore keys aimed at a control inside the row.
                    if (e.target !== e.currentTarget) return;
                    e.preventDefault();
                    setDetailId(job.id);
                  }
                }}
                className="cursor-pointer border-t-2 border-border/15 first:border-t-0 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
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
        initialUrl={addUrl}
        onClose={() => {
          setAddOpen(false);
          setAddText(undefined);
          setAddUrl(undefined);
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
        message="This permanently deletes every job, your resume, and stored screenshots from this browser — with no undo. Export a backup first if you want one."
        confirmLabel="Clear everything"
        requireText="CLEAR"
        onConfirm={() => {
          void clearAllData();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
