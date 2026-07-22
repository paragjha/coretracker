import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Job, JobStatus } from '../types/types';
import { JOB_STATUSES, STATUS_LABELS } from '../types/types';
import { db, RESUME_ID } from '../lib/db/db';
import { updateJob } from '../lib/jobs';
import { scheduleDelete } from '../lib/undoableDelete';
import { setJobStatus } from '../lib/statusChange';
import { scoreOne, isStale } from '../lib/scoreActions';
import { hasApiKey } from '../lib/api/client';
import { formatDate } from '../lib/format';
import { Button, Field, Select, StatusBadge } from './ui/primitives';
import { SlideOver, ConfirmDialog } from './ui/overlays';
import { JobFields, type JobDraft } from './JobFields';
import { ScoreBreakdownPanel } from './ScoreBreakdownPanel';

// Row detail slide-over: all fields editable inline, status dropdown routed
// through the shared statusChange path, delete with confirm. The same panel is
// reused by the kanban view (Phase 6).
export function JobDetailPanel({
  jobId,
  onClose,
}: {
  jobId: string | null;
  onClose: () => void;
}) {
  const job = useLiveQuery(() => (jobId ? db.jobs.get(jobId) : undefined), [jobId]);
  const resume = useLiveQuery(() => db.resume.get(RESUME_ID), []);
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  // Seed the editable draft when a (different) job loads.
  useEffect(() => {
    if (!job) {
      setDraft(null);
      return;
    }
    setDraft({
      company: job.company,
      roleTitle: job.roleTitle,
      jdText: job.jdText,
      salaryBand: job.salaryBand,
      location: job.location,
      workMode: job.workMode,
      contactEmail: job.contactEmail,
      contactName: job.contactName,
      applyUrl: job.applyUrl,
      skillsRequired: job.skillsRequired,
      experienceRequired: job.experienceRequired,
      dateApplied: job.dateApplied,
      notes: job.notes,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  // Status changes can set dateApplied underneath the open panel (shared
  // statusChange path) — keep that one field in sync without clobbering edits.
  useEffect(() => {
    setDraft((d) => (d && d.dateApplied !== job?.dateApplied ? { ...d, dateApplied: job?.dateApplied } : d));
  }, [job?.dateApplied]);

  // Load the original screenshot blob, if this job came from one.
  useEffect(() => {
    let url: string | null = null;
    if (job?.screenshotRef) {
      db.screenshots.get(job.screenshotRef).then((shot) => {
        if (shot) {
          url = URL.createObjectURL(shot.blob);
          setScreenshotUrl(url);
        }
      });
    } else {
      setScreenshotUrl(null);
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.screenshotRef]);

  if (!jobId) return null;

  const patch = (p: Partial<JobDraft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    // Inline edit: persist immediately (field-level autosave).
    if (job) void updateJob(job.id, p as Partial<Job>);
  };

  const onStatus = (next: JobStatus) => {
    if (job) void setJobStatus(job, next);
  };

  const onDelete = () => {
    if (job) {
      // Soft delete: closes immediately, actual DB delete is grace-period
      // deferred (see undoableDelete.ts) so "Undo" in the toast can cancel it.
      scheduleDelete(job);
      setConfirmDelete(false);
      onClose();
    }
  };

  const onScore = async () => {
    if (!job || scoring) return;
    setScoring(true);
    setScoreError(null);
    try {
      await scoreOne(job);
    } catch (e) {
      setScoreError(e instanceof Error ? e.message : String(e));
    } finally {
      setScoring(false);
    }
  };

  return (
    <SlideOver
      open={!!jobId}
      onClose={onClose}
      title={
        job ? (
          <span className="flex items-center gap-3">
            {job.company || 'Untitled'}
            <StatusBadge status={job.status} />
          </span>
        ) : (
          'Loading…'
        )
      }
      footer={
        <>
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {job && draft && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={job.status} onChange={(e) => onStatus(e.target.value as JobStatus)}>
                {JOB_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="text-xs text-ink-2 self-end pb-2">
              Added {formatDate(job.dateAdded)}
              {job.dateApplied && <> · Applied {formatDate(job.dateApplied)}</>}
            </div>
          </div>

          {/* Scoring */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-2">
                Match score
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={onScore}
                disabled={scoring || !hasApiKey()}
                title={hasApiKey() ? undefined : 'Requires VITE_GEMINI_API_KEY in .env.local'}
              >
                {scoring ? 'Scoring…' : job.matchScore != null ? 'Rescore' : 'Score'}
              </Button>
            </div>
            {job.matchScore != null && job.scoreBreakdown ? (
              <ScoreBreakdownPanel job={job} stale={isStale(job, resume?.version)} />
            ) : (
              <p className="text-xs text-ink-2">
                {hasApiKey()
                  ? 'Not scored yet. Scoring compares this JD against your current resume.'
                  : 'Add VITE_GEMINI_API_KEY to .env.local to enable scoring.'}
              </p>
            )}
            {scoreError && <p className="text-xs font-bold text-weak">{scoreError}</p>}
          </div>

          {screenshotUrl && (
            <div>
              <span className="mb-1.5 block font-mono text-[11px] font-bold uppercase tracking-wide text-ink-2">
                Original screenshot
              </span>
              <a href={screenshotUrl} target="_blank" rel="noreferrer">
                <img
                  src={screenshotUrl}
                  alt="Original job posting screenshot"
                  className="max-h-64 border-[3px] border-border object-contain"
                />
              </a>
            </div>
          )}

          <JobFields value={draft} onChange={patch} showDateApplied />
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this job?"
        message={
          <>
            <strong>{job?.company}</strong> — {job?.roleTitle}. This permanently removes the row
            {job?.screenshotRef ? ' and its screenshot' : ''}.
          </>
        }
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </SlideOver>
  );
}
