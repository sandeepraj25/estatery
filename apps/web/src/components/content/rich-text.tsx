import Link from 'next/link';
import { parseRichText, type Block, type Inline } from '@estatery/shared';
import { cn } from '@/lib/format';

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.t === 'bold') return <strong key={i} className="font-semibold text-ink">{p.v}</strong>;
        if (p.t === 'link') {
          const cls = 'font-medium underline decoration-accent decoration-2 underline-offset-4 hover:decoration-ink';
          return p.href.startsWith('/')
            ? <Link key={i} href={p.href} className={cls}>{p.v}</Link>
            : <a key={i} href={p.href} className={cls} {...(p.href.startsWith('https://') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{p.v}</a>;
        }
        return <span key={i}>{p.v}</span>;
      })}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'h2':
      return <h2 id={b.id} className="scroll-mt-28 pt-4 font-heading text-[1.5rem] font-semibold leading-tight tracking-tight sm:text-[1.75rem]">{b.text}</h2>;
    case 'h3':
      return <h3 id={b.id} className="scroll-mt-28 font-heading text-lg font-semibold">{b.text}</h3>;
    case 'ul':
      return <ul className="list-disc space-y-2 pl-5 marker:text-accent">{b.items.map((it, i) => <li key={i}><Inlines parts={it} /></li>)}</ul>;
    case 'ol':
      return <ol className="list-decimal space-y-2 pl-5 marker:font-semibold marker:text-accent">{b.items.map((it, i) => <li key={i}><Inlines parts={it} /></li>)}</ol>;
    default:
      return <p><Inlines parts={b.c} /></p>;
  }
}

/**
 * Renders "simple formatting" text (see @estatery/shared content.ts) as React elements.
 * There is no HTML anywhere in this path, so agency-written text can't inject markup.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseRichText(text);
  return <div className={cn('space-y-5 text-ink/85', className)}>{blocks.map((b, i) => <BlockView key={i} b={b} />)}</div>;
}

/** Headings for an "On this page" list. */
export function outline(text: string) {
  return parseRichText(text).flatMap((b) => (b.t === 'h2' ? [{ id: b.id, text: b.text }] : []));
}
