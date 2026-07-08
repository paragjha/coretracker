import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, RESUME_ID } from '../lib/db/db';
import { saveResume, undoResume } from '../lib/resume';
import { formatDate } from '../lib/format';
import { MarkdownPreview } from '../lib/markdown';
import { Button, TextArea } from '../components/ui/primitives';

// Dedicated resume page. The saved version here is always the scoring
// baseline; saving bumps the version, which flags existing scores as stale.
export function ResumeView() {
  const resume = useLiveQuery(() => db.resume.get(RESUME_ID), []);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [seeded, setSeeded] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const onPdfUpload = async (file: File) => {
    setParsing(true);
    setPdfError(null);
    try {
      // Load the PDF parser (pdfjs) on demand — keeps it out of the initial bundle.
      const { extractPdfText } = await import('../lib/pdf');
      const extracted = await extractPdfText(file);
      if (!extracted.trim()) {
        setPdfError('No text found — this looks like a scanned/image-only PDF. Paste the text instead.');
        return;
      }
      // Drop the extracted text into the editor for review; the user saves it
      // (which bumps the version and keeps one-step undo).
      setText(extracted);
      setMode('edit');
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Could not read that PDF.');
    } finally {
      setParsing(false);
    }
  };

  // Seed the editor once the stored resume loads.
  useEffect(() => {
    if (resume && !seeded) {
      setText(resume.content);
      setSeeded(true);
    }
  }, [resume, seeded]);

  const dirty = text !== (resume?.content ?? '');
  const firstRun = resume === undefined || resume === null || resume?.content === undefined;

  const onSave = async () => {
    if (!text.trim() || !dirty) return;
    await saveResume(text);
  };

  const onUndo = async () => {
    const restored = await undoResume();
    if (restored) setText(restored.content);
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl">Base resume</h2>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ink-2">
            {resume
              ? `Version ${resume.version} · saved ${formatDate(resume.updatedAt)} · scoring baseline`
              : 'No resume yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => pdfInputRef.current?.click()}
            disabled={parsing}
            title="Extract text from a PDF resume into the editor"
          >
            {parsing ? 'Reading PDF…' : 'Upload PDF'}
          </Button>
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPdfUpload(f);
              e.target.value = '';
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMode((m) => (m === 'edit' ? 'preview' : 'edit'))}
          >
            {mode === 'edit' ? 'Preview' : 'Edit'}
          </Button>
          {resume?.previousContent != null && (
            <Button variant="secondary" size="sm" onClick={onUndo} title="Swap back to the previous saved version">
              Undo last save
            </Button>
          )}
          <Button size="sm" onClick={onSave} disabled={!dirty || !text.trim()}>
            {dirty ? 'Save' : 'Saved'}
          </Button>
        </div>
      </div>

      {pdfError && (
        <div className="mt-4 border-[3px] border-border bg-red p-3 text-sm font-bold text-white shadow-sm">
          {pdfError}
        </div>
      )}

      {firstRun && !text && (
        <div className="mt-4 border-[3px] border-dashed border-border bg-surface p-4 text-sm text-ink-2">
          Upload a PDF or paste your resume as text/markdown. The saved version becomes the baseline
          that all match scores are computed against.
        </div>
      )}

      <div className="mt-4">
        {mode === 'edit' ? (
          <TextArea
            rows={24}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your resume as text or markdown…"
            className="font-mono text-[13px] leading-relaxed"
          />
        ) : (
          <div className="min-h-[24rem] border-[3px] border-border bg-surface p-6 shadow-md">
            {text.trim() ? (
              <MarkdownPreview source={text} />
            ) : (
              <p className="text-sm text-ink-2">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>

      {dirty && (
        <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-wide text-moderate">
          Unsaved changes — scores keep using version {resume?.version ?? '—'} until you save.
        </p>
      )}
    </div>
  );
}
