export interface SkeletonProps {
  className?: string;
}

// A quiet pulsing placeholder — used instead of a blank page or a
// full-page spinner while a list/section is loading, so the layout
// doesn't jump once real content arrives.
export function Skeleton({ className }: SkeletonProps) {
  return <div className={['animate-pulse rounded-lg bg-slate-200/70', className ?? 'h-4 w-full'].join(' ')} aria-hidden="true" />;
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-card">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
