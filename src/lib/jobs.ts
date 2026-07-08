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
