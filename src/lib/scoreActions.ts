import type { Job } from '../types/types';
import { db, getResume } from './db/db';
import { scoreJob } from './api/score';

// Shared scoring triggers used by the detail panel and the sheet header.

export function isStale(job: Job, currentResumeVersion?: number): boolean {
  if (job.matchScore == null) return false;
  return currentResumeVersion != null && job.scoredAgainstResumeVersion !== currentResumeVersion;
}

/** Scores one job against the current resume. Throws if no resume exists. */
export async function scoreOne(job: Job): Promise<void> {
  const resume = await getResume();
  if (!resume?.content) {
    throw new Error('Add a resume first — it is the scoring baseline.');
  }
  await scoreJob(job, resume);
}

export interface RescoreAllOptions {
  includeNonToApply?: boolean;
}

/**
 * Rescores every stale job. Defaults to `to_apply` only (per the guide — don't
 * burn tokens on already-rejected or applied jobs); opt in to the rest.
 * Returns how many were rescored. Processed sequentially for score stability.
 */
export async function rescoreAllStale(opts: RescoreAllOptions = {}): Promise<number> {
  const resume = await getResume();
  if (!resume?.content) {
    throw new Error('Add a resume first — it is the scoring baseline.');
  }
  const jobs = await db.jobs.toArray();
  const targets = jobs.filter((job) => {
    if (!isStale(job, resume.version)) return false;
    return opts.includeNonToApply ? true : job.status === 'to_apply';
  });
  for (const job of targets) {
    await scoreJob(job, resume);
  }
  return targets.length;
}

export async function countStale(includeNonToApply: boolean): Promise<number> {
  const resume = await getResume();
  if (!resume) return 0;
  const jobs = await db.jobs.toArray();
  return jobs.filter(
    (job) =>
      isStale(job, resume.version) && (includeNonToApply ? true : job.status === 'to_apply'),
  ).length;
}
