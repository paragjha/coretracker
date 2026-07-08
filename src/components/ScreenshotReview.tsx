import { useEffect, useMemo, useState } from 'react';
import type { ExtractionResult } from '../types/types';
import { db, getResume } from '../lib/db/db';
import { createJob } from '../lib/jobs';
import { scoreJob } from '../lib/api/score';
import { uid } from '../lib/format';
import { Button } from './ui/primitives';
import { SlideOver } from './ui/overlays';
import { JobFields, draftFromExtraction, type JobDraft } from './JobFields';

// Human review gate between extraction and row creation. Never auto-insert:
// the extracted fields are editable next to the source screenshot, and the row
// is only created on explicit confirm. If a resume exists, confirming also
// triggers scoring, so a screenshot goes image -> scored row in one flow.
export function ScreenshotReview({
  blob,
  result,
  onDone,
  onCancel,
}: {
  blob: Blob;
  result: ExtractionResult;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<JobDraft>(() => draftFromExtraction(result));
  const [saving, setSaving] = useState(false);
  const [scoring, setScoring] = useState(false);

  const imageUrl = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(imageUrl), [imageUrl]);

  const valid = draft.company.trim() !== '' && draft.roleTitle.trim() !== '';

  const confirm = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const ref = uid();
      await db.screenshots.add({ ref, blob, createdAt: new Date().toISOString() });
      const job = await createJob({ ...draft, jdSource: 'screenshot', screenshotRef: ref });

      // Auto-score on confirm when a resume exists. Failures don't block the
      // row — the job stays unscored and can be scored manually later.
      const resume = await getResume();
      if (resume?.content) {
        setScoring(true);
        try {
          await scoreJob(job, resume);
        } catch (e) {
          console.warn('Auto-score failed; job saved unscored.', e);
        }
      }
      onDone();
    } finally {
      setSaving(false);
      setScoring(false);
    }
  };

  return (
    <SlideOver
      open
      onClose={onCancel}
      title="Review extraction"
      width="max-w-4xl"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Discard
          </Button>
          <Button onClick={confirm} disabled={!valid || saving}>
            {scoring ? 'Scoring…' : saving ? 'Saving…' : 'Confirm & add'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-6">
        <div>
          <span className="mb-1.5 block font-mono text-[11px] font-bold uppercase tracking-wide text-ink-2">
            Screenshot
          </span>
          <img
            src={imageUrl}
            alt="Job posting screenshot"
            className="w-full border-[3px] border-border object-contain shadow-sm"
          />
        </div>
        <div>
          <JobFields value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
        </div>
      </div>
    </SlideOver>
  );
}
