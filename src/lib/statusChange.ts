import type { Job, JobStatus } from '../types/types';
import { db } from './db/db';
import { todayISO } from './format';

// THE single status-transition path. Used by the sheet dropdown AND kanban
// drag-drop so the rules live in exactly one place.
//
// Rules:
//   - moving to `applied` auto-sets dateApplied to today (if not already set)
//   - every status change stamps statusChangedAt (drives days-in-status +
//     the 14-day no-response flag)
export function statusChangePatch(job: Job, next: JobStatus): Partial<Job> {
  if (job.status === next) return {};
  const patch: Partial<Job> = { status: next, statusChangedAt: todayISO() };
  if (next === 'applied' && !job.dateApplied) {
    patch.dateApplied = todayISO();
  }
  return patch;
}

export async function setJobStatus(job: Job, next: JobStatus): Promise<void> {
  const patch = statusChangePatch(job, next);
  if (Object.keys(patch).length > 0) {
    await db.jobs.update(job.id, patch);
  }
}
