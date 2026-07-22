import type { Job } from '../types/types';
import { deleteJob } from './jobs';

// Soft-delete via a grace-period timer: confirming "Delete" does NOT touch the
// DB immediately. It schedules the real delete after UNDO_WINDOW_MS and shows
// a toast; "Undo" just cancels the timer. Views hide pending-deletion rows
// immediately via usePendingDeletionIds() so the row disappears at once even
// though nothing is destroyed until the window elapses.

const UNDO_WINDOW_MS = 10_000;

export interface PendingDeletion {
  id: string;
  job: Job;
  timeoutId: ReturnType<typeof setTimeout>;
}

type Listener = (pending: PendingDeletion[]) => void;

let pending: PendingDeletion[] = [];
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l([...pending]);
}

export function subscribePendingDeletions(listener: Listener): () => void {
  listeners.add(listener);
  listener([...pending]);
  return () => {
    listeners.delete(listener);
  };
}

export function getPendingDeletionIds(): Set<string> {
  return new Set(pending.map((p) => p.id));
}

export function scheduleDelete(job: Job): void {
  const timeoutId = setTimeout(() => {
    pending = pending.filter((p) => p.id !== job.id);
    notify();
    void deleteJob(job);
  }, UNDO_WINDOW_MS);
  pending = [...pending, { id: job.id, job, timeoutId }];
  notify();
}

export function cancelPendingDeletion(id: string): void {
  const entry = pending.find((p) => p.id === id);
  if (!entry) return;
  clearTimeout(entry.timeoutId);
  pending = pending.filter((p) => p.id !== id);
  notify();
}
