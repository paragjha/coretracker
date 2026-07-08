import type { Resume } from '../types/types';
import { db, RESUME_ID } from './db/db';
import { todayISO } from './format';

// Single base resume. Every save increments version and keeps exactly one
// step of history (previousContent) for undo. The current saved version is
// always the scoring baseline.

export async function saveResume(content: string): Promise<Resume> {
  const existing = await db.resume.get(RESUME_ID);
  const next: Resume = existing
    ? {
        ...existing,
        content,
        previousContent: existing.content,
        version: existing.version + 1,
        updatedAt: todayISO(),
      }
    : {
        id: RESUME_ID,
        content,
        version: 1,
        updatedAt: todayISO(),
      };
  await db.resume.put(next);
  return next;
}

/** One-step undo: swaps content and previousContent (a second undo redoes). */
export async function undoResume(): Promise<Resume | undefined> {
  const existing = await db.resume.get(RESUME_ID);
  if (!existing?.previousContent) return existing;
  const next: Resume = {
    ...existing,
    content: existing.previousContent,
    previousContent: existing.content,
    version: existing.version + 1,
    updatedAt: todayISO(),
  };
  await db.resume.put(next);
  return next;
}
