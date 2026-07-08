import { useEffect, useState } from 'react';
import { SheetView } from './views/SheetView';
import { ResumeView } from './views/ResumeView';
import { KanbanView } from './views/KanbanView';
import { cx } from './components/ui/primitives';

type View = 'sheet' | 'kanban' | 'resume';

const VIEW_KEY = 'coretracker.view';

function loadView(): View {
  const saved = localStorage.getItem(VIEW_KEY);
  return saved === 'sheet' || saved === 'kanban' || saved === 'resume' ? saved : 'sheet';
}

function App() {
  const [view, setView] = useState<View>(loadView);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  const tab = (v: View, label: string) => (
    <button
      onClick={() => setView(v)}
      className={cx(
        'rounded-full border-2 border-border px-3.5 py-1 text-sm font-bold transition-colors',
        view === v ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b-[3px] border-border bg-bg px-6 py-3">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            {/* Geometric mark: tangerine square with rotated ink diamond. */}
            <span className="relative grid h-7 w-7 place-items-center border-2 border-border bg-accent">
              <span className="h-3 w-3 rotate-45 bg-ink" />
            </span>
            <h1 className="font-display text-xl font-bold tracking-tight">CoreTracker</h1>
            <span className="hidden font-mono text-[10px] font-bold uppercase tracking-wider text-ink-2 sm:inline">
              v2 · local
            </span>
          </div>
          <nav className="flex items-center gap-2">
            {tab('sheet', 'Sheet')}
            {tab('kanban', 'Kanban')}
            {tab('resume', 'Resume')}
          </nav>
        </div>
      </header>
      <main>
        {view === 'sheet' && <SheetView />}
        {view === 'kanban' && <KanbanView />}
        {view === 'resume' && <ResumeView />}
      </main>
    </div>
  );
}

export default App;
