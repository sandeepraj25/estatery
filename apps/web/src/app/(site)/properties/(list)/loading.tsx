export default function Loading() {
  return (
    <div className="container-site pt-32 pb-24" aria-busy="true" aria-label="Loading properties">
      <div className="h-4 w-32 animate-pulse rounded bg-line" />
      <div className="mt-6 h-12 w-2/3 max-w-xl animate-pulse rounded-lg bg-line" />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-[var(--radius-card)] bg-white">
            <div className="aspect-[4/3] animate-pulse bg-line/70" />
            <div className="space-y-3 p-5">
              <div className="h-4 w-1/2 animate-pulse rounded bg-line" />
              <div className="h-5 w-3/4 animate-pulse rounded bg-line" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-line" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
