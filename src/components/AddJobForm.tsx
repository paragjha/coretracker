import { useEffect, useState } from 'react';
import { createJob } from '../lib/jobs';
import { getResume } from '../lib/db/db';
import { scoreJob } from '../lib/api/score';
import { extractFromText, NotAJobPostingError, ExtractionParseError } from '../lib/api/extract';
import { hasApiKey } from '../lib/api/client';
import { Button, Segmented, TextArea, cx } from './ui/primitives';
import { SlideOver } from './ui/overlays';
import { JobFields, emptyDraft, draftFromExtraction, type JobDraft } from './JobFields';

type Mode = 'paste' | 'manual';

// Manual entry, or "smart paste": drop the whole posting and let the model sort
// it into fields for review before the row is created. `initialText` lets the
// sheet hand off a pasted JD — it opens straight into paste mode and auto-sorts.
export function AddJobForm({
  open,
  onClose,
  initialText,
}: {
  open: boolean;
  onClose: () => void;
  initialText?: string;
}) {
  const [draft, setDraft] = useState<JobDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [mode, setMode] = useState<Mode>(hasApiKey() ? 'paste' : 'manual');
  const [blob, setBlob] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const patch = (p: Partial<JobDraft>) => setDraft((d) => ({ ...d, ...p }));
  const valid = draft.company.trim() !== '' && draft.roleTitle.trim() !== '';

  const reset = () => {
    setDraft(emptyDraft());
    setBlob('');
    setPasteError(null);
    setMode(hasApiKey() ? 'paste' : 'manual');
  };

  const close = () => {
    reset();
    onClose();
  };

  const extract = async (source: string = blob) => {
    if (!source.trim() || extracting) return;
    setExtracting(true);
    setPasteError(null);
    try {
      const result = await extractFromText(source);
      setDraft((d) => ({ ...draftFromExtraction(result), notes: d.notes }));
      setMode('manual'); // drop into the fields to review what was parsed
    } catch (e) {
      if (e instanceof NotAJobPostingError) {
        setPasteError("That doesn't look like a job posting. Check the text or fill fields manually.");
      } else if (e instanceof ExtractionParseError) {
        // Nothing lost: keep the pasted text as the JD and let the user fill the rest.
        setDraft((d) => ({ ...d, jdText: source }));
        setMode('manual');
        setPasteError('Could not auto-sort the fields — your text is in the JD box; fill the rest.');
      } else {
        setPasteError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setExtracting(false);
    }
  };

  // Handoff from a sheet paste: seed the pasted text and auto-sort (or, without
  // a key, drop it into the JD box for manual entry). Runs once per open.
  useEffect(() => {
    if (!open || !initialText?.trim()) return;
    if (hasApiKey()) {
      setMode('paste');
      setBlob(initialText);
      void extract(initialText);
    } else {
      setMode('manual');
      setDraft({ ...emptyDraft(), jdText: initialText });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const job = await createJob({ ...draft, jdSource: 'paste' });
      // Auto-score against the saved resume so a match score appears right away
      // (same as the screenshot flow). No resume yet → it just stays unscored.
      const resume = await getResume();
      if (resume?.content) {
        setScoring(true);
        try {
          await scoreJob(job, resume);
        } catch (e) {
          console.warn('Auto-score failed; job saved unscored.', e);
        }
      }
      reset();
      onClose();
    } finally {
      setSaving(false);
      setScoring(false);
    }
  };

  return (
    <SlideOver
      open={open}
      onClose={close}
      title="Add job"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          {mode === 'paste' ? (
            <Button onClick={() => extract()} disabled={!blob.trim() || extracting}>
              {extracting ? 'Sorting…' : 'Extract & review'}
            </Button>
          ) : (
            <Button onClick={save} disabled={!valid || saving}>
              {scoring ? 'Scoring…' : saving ? 'Saving…' : 'Add job'}
            </Button>
          )}
        </>
      }
    >
      {hasApiKey() && (
        <div className="mb-4">
          <Segmented<Mode>
            options={[
              { value: 'paste', label: 'Paste & sort' },
              { value: 'manual', label: 'Manual entry' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
      )}

      {mode === 'paste' ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            Paste the entire job posting — the tool sorts it into fields for you to review before
            adding.
          </p>
          <TextArea
            rows={16}
            value={blob}
            onChange={(e) => setBlob(e.target.value)}
            placeholder="Paste the full job description here…"
            className={cx('font-mono text-[13px]')}
          />
          {pasteError && <p className="text-xs font-bold text-weak">{pasteError}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {pasteError && (
            <div className="border-[3px] border-border bg-yellow p-2.5 text-xs font-bold text-ink">
              {pasteError}
            </div>
          )}
          <JobFields value={draft} onChange={patch} />
        </div>
      )}
    </SlideOver>
  );
}
