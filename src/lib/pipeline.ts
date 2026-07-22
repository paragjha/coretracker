import type { Job } from '../types/types';
import { daysSince } from './format';

export const NO_RESPONSE_DAYS = 14;

// An applied job is flagged "no response" when its status hasn't changed for
// 14+ days — a nudge to follow up or mark it ghosted.
export function isNoResponse(job: Job): boolean {
  return job.status === 'applied' && daysSince(job.statusChangedAt) >= NO_RESPONSE_DAYS;
}

// An application only counts toward the response rate once it's had a fair
// chance to be answered. Before that it's neither a reply nor a silence.
export const RESPONSE_GRACE_DAYS = 7;

export interface PipelineStats {
  toApply: number;
  appliedThisWeek: number;
  interviewing: number;
  /** Replies ÷ applications older than the grace period. null = not measurable yet. */
  responseRate: number | null;
  /** Applications old enough to count toward responseRate (the denominator). */
  responseEligible: number;
  totalApplied: number;
}

/** Heard back in any form — a rejection is a reply; silence and ghosting are not. */
function isReply(status: Job['status']): boolean {
  return status === 'interviewing' || status === 'offer' || status === 'rejected';
}

export function computeStats(jobs: Job[]): PipelineStats {
  const now = Date.now();
  const weekAgo = now - 7 * 86_400_000;

  let toApply = 0;
  let interviewing = 0;
  let appliedThisWeek = 0;
  let totalApplied = 0; // reached applied stage or beyond
  let responseEligible = 0; // applied long enough ago to expect an answer
  let replies = 0;

  for (const job of jobs) {
    if (job.status === 'to_apply') toApply++;
    if (job.status === 'interviewing') interviewing++;
    if (job.status !== 'to_apply') totalApplied++;

    if (job.dateApplied) {
      const appliedAt = new Date(job.dateApplied).getTime();
      if (appliedAt >= weekAgo) appliedThisWeek++;
      // Only applications past the grace period form the denominator, so a
      // fresh batch of applications can't drag the rate to a misleading 0%.
      if (daysSince(job.dateApplied) >= RESPONSE_GRACE_DAYS) {
        responseEligible++;
        if (isReply(job.status)) replies++;
      }
    }
  }

  return {
    toApply,
    appliedThisWeek,
    interviewing,
    totalApplied,
    responseEligible,
    responseRate: responseEligible > 0 ? replies / responseEligible : null,
  };
}
