'use client';

import { Fragment } from 'react';

// Render inline bold/italic tokens within a single text node.
function renderInline(text: string): React.ReactNode {
  // Split on **bold** and *italic* spans that contain no newlines or asterisks
  const tokens = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      return <strong key={i} className="font-semibold">{tok.slice(2, -2)}</strong>;
    }
    if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 2) {
      return <em key={i}>{tok.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{tok}</Fragment>;
  });
}

// Render a markdown string with paragraphs, headings, bullets, numbered lists.
export function MessageContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (line.trim() === '') {
      nodes.push(<div key={i} className="h-1" />);
      i++;
      continue;
    }

    // Unordered list — collect consecutive items
    if (/^[-*] /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i] ?? '')) {
        items.push(
          <li key={i} className="flex gap-2 leading-relaxed">
            <span className="flex-shrink-0 text-slate-400 select-none mt-px">•</span>
            <span>{renderInline((lines[i] ?? '').slice(2))}</span>
          </li>,
        );
        i++;
      }
      nodes.push(<ul key={`ul-${i}`} className="space-y-0.5">{items}</ul>);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i] ?? '')) {
        const m = /^(\d+)\. (.*)/.exec(lines[i] ?? '');
        items.push(
          <li key={i} className="flex gap-2 leading-relaxed">
            <span className="flex-shrink-0 text-slate-400 select-none tabular-nums">{m?.[1]}.</span>
            <span>{renderInline(m?.[2] ?? '')}</span>
          </li>,
        );
        i++;
      }
      nodes.push(<ol key={`ol-${i}`} className="space-y-0.5">{items}</ol>);
      continue;
    }

    // Headings — styled lightly to fit the chat aesthetic
    if (line.startsWith('### ')) {
      nodes.push(<p key={i} className="font-semibold text-gray-800">{renderInline(line.slice(4))}</p>);
      i++;
      continue;
    }
    if (line.startsWith('## ') || line.startsWith('# ')) {
      const depth = line.startsWith('## ') ? 3 : 2;
      nodes.push(<p key={i} className="font-semibold text-gray-900">{renderInline(line.slice(depth))}</p>);
      i++;
      continue;
    }

    // Regular paragraph
    nodes.push(<p key={i} className="leading-relaxed">{renderInline(line)}</p>);
    i++;
  }

  return <div className="space-y-1.5">{nodes}</div>;
}
