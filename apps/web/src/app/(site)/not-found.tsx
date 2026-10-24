import Link from 'next/link';

export default function SiteNotFound() {
  return (
    <div className="container-site grid min-h-[70vh] place-items-center pt-32 pb-24 text-center">
      <div className="max-w-md">
        <p className="kicker justify-center">Page not found</p>
        <h1 className="type-display type-section mt-4">This address isn’t on our map.</h1>
        <p className="mt-4 text-muted">The listing may have been sold or the link may be mistyped.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/properties" className="btn btn-primary">Browse properties</Link>
          <Link href="/" className="btn btn-ghost">Go home</Link>
        </div>
      </div>
    </div>
  );
}
