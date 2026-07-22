import { useEffect, useState } from 'react';
import {
  subscribePendingDeletions,
  cancelPendingDeletion,
  type PendingDeletion,
} from '../lib/undoableDelete';
import { Button } from './ui/primitives';

// Mounted once at the app root. Renders a toast per job in its undo grace
// period; "Undo" cancels the scheduled delete before it actually runs.
export function UndoToastHost() {
  const [pending, setPending] = useState<PendingDeletion[]>([]);

  useEffect(() => subscribePendingDeletions(setPending), []);

  if (pending.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {pending.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-3 border-[3px] border-border bg-ink px-4 py-3 text-bg shadow-lg"
        >
          <span className="text-sm">
            Deleted <strong>{p.job.company || 'job'}</strong>
          </span>
          <Button variant="secondary" size="sm" onClick={() => cancelPendingDeletion(p.id)}>
            Undo
          </Button>
        </div>
      ))}
    </div>
  );
}
