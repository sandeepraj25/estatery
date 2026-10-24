'use client';

import { CheckCircle2, Circle, ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { articleInputSchema, articlePublishProblems, readingMinutes, slugify, type ArticleInput, type ArticleStatus } from '@estatery/shared';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { cn } from '@/lib/format';
import { FormSection, Notice, SelectField, TextArea, TextField, useUnsavedGuard } from './fields';
import { ImageField } from './media-picker';
import { RichTextField } from './rich-text-field';

export interface ArticleDto extends ArticleInput {
  id: string;
  status: ArticleStatus;
  readMinutes: number;
  publishedAt: string | null;
  updatedAt: string;
}

const EMPTY: ArticleInput = { title: '', slug: '', excerpt: '', category: '', image: '', imageAlt: '', body: '', authorId: null, seoTitle: '', seoDescription: '' };
const strip = (a: ArticleDto): ArticleInput => ({
  title: a.title, slug: a.slug, excerpt: a.excerpt, category: a.category, image: a.image, imageAlt: a.imageAlt, body: a.body,
  authorId: a.authorId, seoTitle: a.seoTitle, seoDescription: a.seoDescription,
});
const RULES = ['Write a summary of at least 40 characters', 'Write at least 80 words', 'Choose a cover image'];

export function ArticleEditor({ initial, authors, categories }: { initial: ArticleDto | null; authors: Array<{ id: string; name: string }>; categories: string[] }) {
  const router = useRouter();
  const [saved, setSaved] = useState<ArticleDto | null>(initial);
  const [form, setForm] = useState<ArticleInput>(() => (initial ? strip(initial) : EMPTY));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string; list?: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved ? strip(saved) : EMPTY), [form, saved]);
  useUnsavedGuard(dirty);
  const problems = articlePublishProblems(form);
  const status = saved?.status ?? 'draft';
  const set = <K extends keyof ArticleInput>(k: K, v: ArticleInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function handleError(e: unknown) {
    if (e instanceof AdminRequestError) {
      setErrors(Object.fromEntries(e.fields.map((f) => [f.path, f.message])));
      setNotice({ tone: 'error', text: e.message, list: e.problems.length ? e.problems : undefined });
    } else setNotice({ tone: 'error', text: 'That didn’t save. Check your connection and try again.' });
  }

  async function save() {
    const r = articleInputSchema.safeParse(form);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message])));
      setNotice({ tone: 'error', text: 'Some fields need attention. They’re highlighted below.' });
      return null;
    }
    setErrors({});
    setBusy('save');
    setNotice(null);
    try {
      const res = saved
        ? await adminRequest<ArticleDto>(`admin/articles/${saved.id}`, { method: 'PUT', body: r.data })
        : await adminRequest<ArticleDto>('admin/articles', { method: 'POST', body: r.data });
      setSaved(res);
      setForm(strip(res));
      setNotice({ tone: 'success', text: !saved ? 'Draft created. Visitors can’t see it until you publish.' : status === 'published' ? 'Changes are live.' : 'Draft saved.' });
      if (!saved) router.replace(`/admin/articles/${res.id}`);
      router.refresh();
      return res;
    } catch (e) {
      handleError(e);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(next: ArticleStatus) {
    if (next === 'draft' && !window.confirm('Unpublish this article? It disappears from your website until you publish it again.')) return;
    let current = saved;
    if (!current || dirty) current = await save();
    if (!current) return;
    setBusy(next);
    try {
      const res = await adminRequest<ArticleDto>(`admin/articles/${current.id}/status`, { method: 'POST', body: { status: next } });
      setSaved(res);
      setForm(strip(res));
      setNotice({ tone: 'success', text: next === 'published' ? 'Published. It’s now on your website.' : 'Unpublished. It’s back to a draft.' });
      router.refresh();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!saved || !window.confirm('Delete this article permanently? This can’t be undone.')) return;
    setBusy('delete');
    try {
      await adminRequest(`admin/articles/${saved.id}`, { method: 'DELETE' });
      router.replace('/admin/articles');
      router.refresh();
    } catch (e) {
      handleError(e);
      setBusy(null);
    }
  }

  const autoSlug = slugify(form.title);
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        {notice && (
          <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
            {notice.text}
            {notice.list && <ul className="mt-1 list-disc pl-5">{notice.list.map((p) => <li key={p}>{p}</li>)}</ul>}
          </Notice>
        )}
        <FormSection title="Article">
          <TextField label="Headline" value={form.title} onChange={(v) => set('title', v)} maxLength={140} error={errors.title} />
          <TextArea label="Summary" value={form.excerpt} onChange={(v) => set('excerpt', v)} maxLength={300} rows={3} error={errors.excerpt} hint="Shown under the headline and on article cards. One or two sentences." />
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <TextField label="Topic" value={form.category} onChange={(v) => set('category', v)} maxLength={40} error={errors.category} hint="Choose an existing topic or type a new one." />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {categories.filter((c) => c !== form.category).slice(0, 8).map((c) => (
                  <button key={c} type="button" onClick={() => set('category', c)} className="rounded-full border border-line px-2.5 py-0.5 text-xs hover:border-ink">{c}</button>
                ))}
              </div>
            </div>
            <SelectField label="Written by" value={form.authorId ?? ''} onChange={(v) => set('authorId', v || null)} options={[{ value: '', label: 'The team (no byline)' }, ...authors.map((a) => ({ value: a.id, label: a.name }))]} hint="Bylines use advisor profiles from the Content library." />
          </div>
          <RichTextField label="Body" value={form.body} onChange={(v) => set('body', v)} error={errors.body} maxLength={60_000} rows={20} hint={`Formatting · about ${readingMinutes(form.body)} min read`} />
        </FormSection>
        <FormSection title="Cover image">
          <ImageField label="Image" value={form.image || null} onChange={(url) => set('image', url ?? '')} aspect="aspect-[21/9]" />
          {errors.image && <p className="text-sm text-[var(--color-error)]" role="alert">{errors.image}</p>}
          <TextField label="Image description" optional value={form.imageAlt} onChange={(v) => set('imageAlt', v)} maxLength={160} hint="For people using screen readers, e.g. “Sea view from a Worli penthouse terrace”." />
        </FormSection>
        <FormSection title="Search engines" description="Leave blank to use the headline and summary.">
          <TextField label="Title in search results" optional value={form.seoTitle} onChange={(v) => set('seoTitle', v)} maxLength={70} />
          <TextArea label="Description in search results" optional value={form.seoDescription} onChange={(v) => set('seoDescription', v)} maxLength={170} rows={2} />
          <TextField label="Web address" optional value={form.slug} onChange={(v) => set('slug', v.toLowerCase())} placeholder={autoSlug || 'created from the headline'} error={errors.slug} hint={`/insights/${form.slug || autoSlug || '…'}${status === 'published' ? ' · unpublish first to change the address of a live article' : ''}`} />
        </FormSection>
      </div>

      <aside className="xl:sticky xl:top-24 xl:self-start">
        <div className="space-y-4 rounded-[14px] border border-line bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="font-heading font-semibold">Status</p>
            <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', status === 'published' ? 'bg-[var(--color-success)]/12 text-[var(--color-success)]' : 'bg-line text-ink/75')}>{status === 'published' ? 'Published' : 'Draft'}</span>
          </div>
          <button type="button" onClick={save} disabled={!!busy || (!dirty && !!saved)} className="btn btn-primary w-full disabled:opacity-50">
            {busy === 'save' ? 'Saving…' : !saved ? 'Create draft' : status === 'published' ? (dirty ? 'Save and update live article' : 'All changes saved') : dirty ? 'Save draft' : 'All changes saved'}
          </button>
          {status === 'draft' ? (
            <button type="button" onClick={() => changeStatus('published')} disabled={!!busy || problems.length > 0} className="btn btn-accent w-full min-h-10 disabled:opacity-50">{busy === 'published' ? 'Publishing…' : 'Publish'}</button>
          ) : (
            <button type="button" onClick={() => changeStatus('draft')} disabled={!!busy} className="btn btn-ghost w-full min-h-10">{busy === 'draft' ? 'Working…' : 'Unpublish'}</button>
          )}
          <div className="border-t border-line pt-4">
            <p className="text-sm font-medium">Ready to publish?</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {RULES.map((rule) => {
                const ok = !problems.includes(rule);
                return (
                  <li key={rule} className={cn('flex items-start gap-2', ok ? 'text-muted' : 'text-ink')}>
                    {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />}
                    <span>{rule}<span className="sr-only">{ok ? ' (done)' : ' (to do)'}</span></span>
                  </li>
                );
              })}
            </ul>
          </div>
          {saved && (
            <div className="space-y-2 border-t border-line pt-4 text-sm">
              {status === 'published' && <a href={`/insights/${saved.slug}`} target="_blank" rel="noopener" className="flex items-center gap-2 font-medium hover:underline"><ExternalLink className="size-4" aria-hidden="true" />View live article</a>}
              <p className="text-muted">Last saved {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(saved.updatedAt))}</p>
              {dirty && <p className="font-medium text-[color-mix(in_oklab,var(--color-accent)_50%,black)]">You have unsaved changes</p>}
            </div>
          )}
          {saved && status === 'draft' && (
            <button type="button" onClick={remove} disabled={!!busy} className="flex items-center gap-2 border-t border-line pt-4 text-sm text-[var(--color-error)] hover:underline"><Trash2 className="size-4" aria-hidden="true" />Delete article</button>
          )}
        </div>
        <Link href="/admin/articles" className="mt-4 block text-sm text-muted hover:text-ink">← All articles</Link>
      </aside>
    </div>
  );
}
