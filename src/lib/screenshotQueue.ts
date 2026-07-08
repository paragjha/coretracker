import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtractionResult } from '../types/types';
import {
  extractFromScreenshot,
  ExtractionParseError,
  NotAJobPostingError,
} from './api/extract';
import { uid } from './format';

// Sequential screenshot-processing queue. One item extracts at a time; a
// finished item waits in 'review' until the user confirms or discards it,
// then the next queued item starts.

export type QueueStatus = 'queued' | 'extracting' | 'review' | 'rejected' | 'failed';

export interface QueueItem {
  id: string;
  blob: Blob;
  status: QueueStatus;
  result?: ExtractionResult;
  errorMessage?: string;
}

export function useScreenshotQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const busy = useRef(false);

  const addImages = useCallback((blobs: Blob[]) => {
    const next = blobs
      .filter((b) => b.type.startsWith('image/'))
      .map((blob): QueueItem => ({ id: uid(), blob, status: 'queued' }));
    if (next.length > 0) setItems((prev) => [...prev, ...next]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // Worker: start extraction when nothing is extracting or awaiting review.
  useEffect(() => {
    const active = items.find((i) => i.status === 'extracting' || i.status === 'review');
    const nextItem = items.find((i) => i.status === 'queued');
    if (active || !nextItem || busy.current) return;

    busy.current = true;
    setItems((prev) =>
      prev.map((i) => (i.id === nextItem.id ? { ...i, status: 'extracting' } : i)),
    );

    extractFromScreenshot(nextItem.blob)
      .then((result) => {
        setItems((prev) =>
          prev.map((i) => (i.id === nextItem.id ? { ...i, status: 'review', result } : i)),
        );
      })
      .catch((err: unknown) => {
        if (err instanceof NotAJobPostingError) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === nextItem.id
                ? { ...i, status: 'rejected', errorMessage: err.message }
                : i,
            ),
          );
        } else if (err instanceof ExtractionParseError) {
          // Nothing lost: raw text lands in the review form's JD field.
          const fallback: ExtractionResult = {
            company: null,
            roleTitle: null,
            jdText: err.rawText,
            salaryBand: null,
            location: null,
            workMode: 'unknown',
            contactEmail: null,
            contactName: null,
            applyUrl: null,
            skillsRequired: [],
            experienceRequired: null,
          };
          setItems((prev) =>
            prev.map((i) =>
              i.id === nextItem.id ? { ...i, status: 'review', result: fallback } : i,
            ),
          );
        } else {
          setItems((prev) =>
            prev.map((i) =>
              i.id === nextItem.id
                ? { ...i, status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) }
                : i,
            ),
          );
        }
      })
      .finally(() => {
        busy.current = false;
      });
  }, [items]);

  const reviewItem = items.find((i) => i.status === 'review') ?? null;
  const pendingCount = items.filter(
    (i) => i.status === 'queued' || i.status === 'extracting',
  ).length;

  return { items, addImages, removeItem, reviewItem, pendingCount };
}
