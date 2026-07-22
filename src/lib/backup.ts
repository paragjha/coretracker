import { db, RESUME_ID } from './db/db';
import type { Job, Resume } from '../types/types';

// Lossless JSON backup/restore — CSV export is for spreadsheets and drops
// skills arrays, screenshots, and score breakdowns; this is the actual
// disaster-recovery path (browser data wipe, borrowed machine, etc).

const BACKUP_VERSION = 1;
const LAST_BACKUP_KEY = 'coretracker.lastBackupAt';
const NUDGE_JOB_THRESHOLD = 25;
const NUDGE_DAYS_THRESHOLD = 14;

interface BackupFile {
  version: number;
  exportedAt: string;
  jobs: Job[];
  resume: Resume | null;
  screenshots: { ref: string; createdAt: string; dataUrl: string }[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function markBackedUp(): void {
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
}

export async function exportBackup(): Promise<void> {
  const [jobs, resume, screenshots] = await Promise.all([
    db.jobs.toArray(),
    db.resume.get(RESUME_ID),
    db.screenshots.toArray(),
  ]);

  const file: BackupFile = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    jobs,
    resume: resume ?? null,
    screenshots: await Promise.all(
      screenshots.map(async (s) => ({
        ref: s.ref,
        createdAt: s.createdAt,
        dataUrl: await blobToDataUrl(s.blob),
      })),
    ),
  };

  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `coretracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  markBackedUp();
}

export class BackupParseError extends Error {}

export interface ImportResult {
  jobsAdded: number;
  jobsUpdated: number;
  resumeRestored: boolean;
}

/** Merge-imports a backup file. Never wipes existing rows the file doesn't mention. */
export async function importBackup(file: File): Promise<ImportResult> {
  const text = await file.text();
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupParseError('That file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.jobs)) {
    throw new BackupParseError('That file does not look like a CoreTracker backup.');
  }

  let jobsAdded = 0;
  let jobsUpdated = 0;
  let resumeRestored = false;

  await db.transaction('rw', db.jobs, db.resume, db.screenshots, async () => {
    for (const s of parsed.screenshots ?? []) {
      const blob = dataUrlToBlob(s.dataUrl);
      await db.screenshots.put({ ref: s.ref, blob, createdAt: s.createdAt });
    }
    for (const job of parsed.jobs) {
      const existing = await db.jobs.get(job.id);
      await db.jobs.put(job);
      if (existing) jobsUpdated++;
      else jobsAdded++;
    }
    // Only overwrite the resume if the backup is at least as recent — never
    // silently regress a resume that's been edited since the backup was made.
    if (parsed.resume) {
      const current = await db.resume.get(RESUME_ID);
      if (!current || parsed.resume.version >= current.version) {
        await db.resume.put(parsed.resume);
        resumeRestored = true;
      }
    }
  });

  markBackedUp();
  return { jobsAdded, jobsUpdated, resumeRestored };
}

export function daysSinceLastBackup(): number | null {
  const raw = localStorage.getItem(LAST_BACKUP_KEY);
  if (!raw) return null;
  return Math.floor((Date.now() - new Date(raw).getTime()) / 86_400_000);
}

/** Quiet nudge trigger: enough data to lose, or overdue on the backup cadence. */
export function shouldNudgeBackup(jobCount: number): boolean {
  if (jobCount >= NUDGE_JOB_THRESHOLD) return true;
  const days = daysSinceLastBackup();
  return days != null && days >= NUDGE_DAYS_THRESHOLD;
}
