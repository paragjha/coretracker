import type { Job } from '../types/types';
import { daysSince } from './format';

export const NO_RESPONSE_DAYS = 14;

// An applied job is flagged "no response" when its status hasn't changed for
// 14+ days — a nudge to follow up or mark it ghosted.
export function isNoResponse(job: Job): boolean {
  return job.status === 'applied' && daysSince(job.statusChangedAt) >= NO_RESPONSE_DAYS;
}

export interface PipelineStats {
  toApply: number;
  appliedThisWeek: number;
  interviewing: number;
  responseRate: number | null; // fraction 0..1, or null when nothing applied
  totalApplied: number;
}

export function computeStats(jobs: Job[]): PipelineStats {
  const now = Date.now();
  const weekAgo = now - 7 * 86_400_000;

  let toApply = 0;
  let interviewing = 0;
  let appliedThisWeek = 0;
  let totalApplied = 0; // reached applied stage or beyond
  let responded = 0; // heard back: interviewing / offer / rejected

  for (const job of jobs) {
    if (job.status === 'to_apply') toApply++;
    if (job.status === 'interviewing') interviewing++;

    if (job.status !== 'to_apply') {
      totalApplied++;
      if (['interviewing', 'offer', 'rejected'].includes(job.status)) responded++;
    }
    if (job.dateApplied && new Date(job.dateApplied).getTime() >= weekAgo) {
      appliedThisWeek++;
    }
  }

  return {
    toApply,
    appliedThisWeek,
    interviewing,
    totalApplied,
    responseRate: totalApplied > 0 ? responded / totalApplied : null,
  };
}
