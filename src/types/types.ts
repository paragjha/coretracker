// CoreTracker v2 data model. Single source of truth — defined before any UI.

export type JobStatus =
  | 'to_apply'
  | 'applied'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'ghosted';

export const JOB_STATUSES: JobStatus[] = [
  'to_apply',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'ghosted',
];

export const STATUS_LABELS: Record<JobStatus, string> = {
  to_apply: 'To Apply',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
};

export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';

export type ExperienceFit = 'under' | 'match' | 'over';

export interface ScoreBreakdown {
  matchedSkills: string[];
  missingSkills: string[];
  experienceFit: ExperienceFit;
  verdict: string; // two lines max
}

export interface Job {
  id: string;
  company: string;
  roleTitle: string;
  jdText: string; // full extracted or pasted JD
  jdSource: 'paste' | 'screenshot';
  screenshotRef?: string; // blob key in the screenshots table, original image kept
  status: JobStatus;
  dateAdded: string; // ISO
  dateApplied?: string;
  statusChangedAt: string; // ISO — last time `status` changed (drives stale/no-response flags)
  salaryBand?: string; // as stated in JD, e.g. "9-12 LPA"
  location?: string;
  workMode?: WorkMode;
  contactEmail?: string;
  contactName?: string;
  applyUrl?: string;
  skillsRequired: string[]; // extracted
  experienceRequired?: string; // e.g. "2-4 years"
  notes: string;
  // scoring
  matchScore?: number; // 0-100
  scoreBreakdown?: ScoreBreakdown;
  scoredAgainstResumeVersion?: number; // stale-score detection
}

export interface Resume {
  id: 'base'; // single base resume, always id 'base'
  content: string; // markdown
  previousContent?: string; // one-step undo (v1 keeps only current + previous)
  version: number; // increments on every save
  updatedAt: string;
}

// Screenshot blobs live in their own table so the jobs table stays light.
export interface ScreenshotBlob {
  ref: string; // uuid, referenced by Job.screenshotRef
  blob: Blob;
  createdAt: string;
}

// Shape returned by the vision extraction call (see lib/api/extract.ts).
export interface ExtractionResult {
  company: string | null;
  roleTitle: string | null;
  jdText: string;
  salaryBand: string | null;
  location: string | null;
  workMode: WorkMode;
  contactEmail: string | null;
  contactName: string | null;
  applyUrl: string | null;
  skillsRequired: string[];
  experienceRequired: string | null;
}
