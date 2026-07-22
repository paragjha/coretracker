import { useEffect, useState, type ReactNode } from 'react';
import { Button, TextInput, cx } from './primitives';

// Right-hand slide-over (the "detail drawer"). Thick ink edge, sharp corners,
// closes on Escape and backdrop click.
export function SlideOver({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative flex h-full w-full flex-col border-l-[3px] border-border bg-bg',
          width,
          'animate-[slideIn_.16s_ease-out]',
        )}
      >
        <header className="flex items-center justify-between border-b-[3px] border-border bg-ink px-5 py-3.5">
          <h2 className="font-display text-lg font-bold text-bg">{title}</h2>
          <Button variant="secondary" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t-[3px] border-border bg-surface px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
      <style>{`@keyframes slideIn{from{transform:translateX(24px)}to{transform:translateX(0)}}`}</style>
    </div>
  );
}

// Centered confirm dialog for destructive actions — hard-shadowed panel.
// `requireText` adds the design system's "destructive action interstitial"
// pattern: the confirm button stays disabled until the user types the exact
// phrase, a hard guardrail for actions with no undo (e.g. wiping all data).
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  requireText,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  requireText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) return;
    setTyped('');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const canConfirm = !requireText || typed === requireText;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/50" onClick={onCancel} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-sm border-[3px] border-border bg-surface p-5 shadow-lg"
      >
        <h3 className="font-display text-base font-bold text-ink">{title}</h3>
        <div className="mt-2 text-sm text-ink-2">{message}</div>
        {requireText && (
          <div className="mt-3">
            <TextInput
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={`Type ${requireText} to confirm`}
              autoFocus
            />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={!canConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
