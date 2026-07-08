/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // All values resolve to the CSS variables in src/index.css, which come
      // from the CoreTracker Design System (neubrutalist). Swap tokens there.
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
        },
        border: 'var(--border)',
        accent: {
          DEFAULT: 'var(--accent)',
          ink: 'var(--accent-ink)',
          soft: 'var(--accent-soft)',
        },
        yellow: 'var(--yellow)',
        green: 'var(--green)',
        red: 'var(--red)',
        blue: 'var(--blue)',
        purple: 'var(--purple)',
        // score bands
        strong: 'var(--score-strong)',
        moderate: 'var(--score-moderate)',
        weak: 'var(--score-weak)',
        // status semantics
        'status-to_apply': 'var(--status-to_apply)',
        'status-applied': 'var(--status-applied)',
        'status-interviewing': 'var(--status-interviewing)',
        'status-offer': 'var(--status-offer)',
        'status-rejected': 'var(--status-rejected)',
        'status-ghosted': 'var(--status-ghosted)',
        danger: 'var(--danger)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        sm: 'var(--radius-sm)',
        none: '0px',
        full: '9999px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        none: 'none',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
    },
  },
  plugins: [],
};
