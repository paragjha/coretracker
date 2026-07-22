import type { Job } from '../types/types';
import { db } from './db/db';
import { todayISO, uid } from './format';

// CRUD helpers for the jobs table. Views use dexie-react-hooks useLiveQuery to
// read reactively; writes go through these so defaults stay consistent.

export type NewJobInput = Partial<Job> &
  Pick<Job, 'company' | 'roleTitle' | 'jdText' | 'jdSource'>;

export function makeJob(input: NewJobInput): Job {
  const now = todayISO();
  return {
    id: uid(),
    company: input.company,
    roleTitle: input.roleTitle,
    jdText: input.jdText,
    jdSource: input.jdSource,
    screenshotRef: input.screenshotRef,
    status: input.status ?? 'to_apply',
    dateAdded: input.dateAdded ?? now,
    dateApplied: input.dateApplied,
    statusChangedAt: input.statusChangedAt ?? now,
    salaryBand: input.salaryBand,
    location: input.location,
    workMode: input.workMode,
    contactEmail: input.contactEmail,
    contactName: input.contactName,
    applyUrl: input.applyUrl,
    skillsRequired: input.skillsRequired ?? [],
    experienceRequired: input.experienceRequired,
    notes: input.notes ?? '',
    matchScore: input.matchScore,
    scoreBreakdown: input.scoreBreakdown,
    scoredAgainstResumeVersion: input.scoredAgainstResumeVersion,
  };
}

export async function createJob(input: NewJobInput): Promise<Job> {
  const job = makeJob(input);
  await db.jobs.add(job);
  return job;
}

/** Strips tracking params and trailing slashes so the same posting compares equal. */
function normalizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    // Aggregators append utm_*/refId/trackingId that differ per visit.
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Finds an existing job that looks like the same posting — same apply URL, or
 * same company + role title. Aggregators (and re-adds) create silent
 * duplicates otherwise; two identical rows with different scores read as a bug.
 */
export async function findDuplicate(
  candidate: { company: string; roleTitle: string; applyUrl?: string },
  excludeId?: string,
): Promise<Job | null> {
  const existing = await db.jobs.toArray();
  const candidateUrl = candidate.applyUrl ? normalizeUrl(candidate.applyUrl) : null;

  for (const job of existing) {
    if (excludeId && job.id === excludeId) continue;
    if (candidateUrl && job.applyUrl && normalizeUrl(job.applyUrl) === candidateUrl) {
      return job;
    }
    if (
      norm(job.company) &&
      norm(job.company) === norm(candidate.company) &&
      norm(job.roleTitle) === norm(candidate.roleTitle)
    ) {
      return job;
    }
  }
  return null;
}

export async function updateJob(id: string, patch: Partial<Job>): Promise<void> {
  await db.jobs.update(id, patch);
}

/** Deletes a job and its stored screenshot blob, if any. */
export async function deleteJob(job: Job): Promise<void> {
  await db.transaction('rw', db.jobs, db.screenshots, async () => {
    if (job.screenshotRef) {
      await db.screenshots.delete(job.screenshotRef);
    }
    await db.jobs.delete(job.id);
  });
}
