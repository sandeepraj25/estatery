import { formatDate } from '@/lib/format';
import { PageHeader } from './page-header';
import { outline, RichText } from './rich-text';

/** Privacy policy and terms: long text with an "On this page" list beside it on wide screens. */
export function LegalPage({ title, intro, body, lastUpdated, crumb }: { title: string; intro: string; body: string; lastUpdated: string; crumb: string }) {
  const toc = outline(body);
  return (
    <>
      <PageHeader crumb={crumb} title={title} intro={intro}>
        <p className="mt-4 text-sm text-muted">Last updated {formatDate(lastUpdated)}</p>
      </PageHeader>
      <div className="container-site pb-24">
        <div className="grid gap-12 lg:grid-cols-[14rem_minmax(0,68ch)] lg:gap-20">
          {toc.length > 2 && (
            <nav aria-label="On this page" className="hidden lg:block">
              <div className="sticky top-28">
                <p className="text-sm font-semibold">On this page</p>
                <ol className="mt-4 space-y-2.5 border-l border-line text-sm">
                  {toc.map((h) => <li key={h.id}><a href={`#${h.id}`} className="-ml-px block border-l border-transparent pl-4 text-muted hover:border-accent hover:text-ink">{h.text}</a></li>)}
                </ol>
              </div>
            </nav>
          )}
          <RichText text={body} className="leading-[1.75] lg:col-start-2" />
        </div>
      </div>
    </>
  );
}
