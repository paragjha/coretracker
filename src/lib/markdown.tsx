import type { ReactNode } from 'react';

// Minimal markdown preview for the resume page — headings, bold, italic,
// inline code, links, bullet lists, paragraphs. Deliberately tiny; the guide
// rules out a WYSIWYG/markdown library for v1.

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // tokens: **bold**, *italic*, `code`, [text](url)
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2] != null) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[4] != null) out.push(<em key={key}>{m[4]}</em>);
    else if (m[6] != null)
      out.push(
        <code key={key} className="rounded bg-surface-2 px-1 py-0.5 text-[0.85em]">
          {m[6]}
        </code>,
      );
    else if (m[8] != null)
      out.push(
        <a key={key} href={m[9]} target="_blank" rel="noreferrer" className="text-accent underline">
          {m[8]}
        </a>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownPreview({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split(/\r?\n/);
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul-${key++}`} className="my-2 list-disc space-y-0.5 pl-6">
        {list.map((item, i) => (
          <li key={i}>{renderInline(item, `li-${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flushList();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const cls = ['text-2xl mt-4', 'text-xl mt-4', 'text-lg mt-3', 'text-base mt-3'][level - 1];
      blocks.push(
        <div key={`h-${key++}`} className={`font-display font-semibold ${cls}`}>
          {renderInline(heading[2], `h-${key}`)}
        </div>,
      );
    } else if (line.trim() === '') {
      blocks.push(<div key={`sp-${key++}`} className="h-2" />);
    } else {
      blocks.push(
        <p key={`p-${key++}`} className="my-1">
          {renderInline(line, `p-${key}`)}
        </p>,
      );
    }
  }
  flushList();

  return <div className="text-sm leading-relaxed text-ink">{blocks}</div>;
}
