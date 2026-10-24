export function SiteUnavailable({ code }: { code: string }) {
  const copy: Record<string, { title: string; body: string }> = {
    TENANT_NOT_FOUND: { title: 'This site isn’t set up yet', body: 'No agency is connected to this web address. If you own this domain, finish connecting it from your admin panel.' },
    TENANT_SUSPENDED: { title: 'This site is temporarily unavailable', body: 'The site owner has paused it. Please check back soon.' },
    SITE_NOT_CONFIGURED: { title: 'This site is being updated', body: 'Please check back in a few minutes.' },
  };
  const c = copy[code] ?? { title: 'We can’t load this site right now', body: 'The property service didn’t respond. Refresh the page in a moment.' };
  return (
    <main className="grid min-h-dvh place-items-center bg-[#10251D] px-6 text-white">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold" style={{ fontFamily: 'Manrope Variable, sans-serif' }}>{c.title}</h1>
        <p className="mt-4 text-[#A8B2AA]">{c.body}</p>
      </div>
    </main>
  );
}
