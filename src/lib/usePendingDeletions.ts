import { useEffect, useState } from 'react';
import { subscribePendingDeletions, getPendingDeletionIds } from './undoableDelete';

/** Job ids currently in their undo grace period — views filter these out so a
 * deleted row disappears instantly, even though the DB delete is still pending. */
export function usePendingDeletionIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => getPendingDeletionIds());
  useEffect(
    () => subscribePendingDeletions((list) => setIds(new Set(list.map((p) => p.id)))),
    [],
  );
  return ids;
}
