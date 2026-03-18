// Skeleton loader component with variants for different page types
// Usage: <PageSkeleton variant="list" /> while data is loading

interface PageSkeletonProps {
  variant: 'list' | 'dashboard' | 'detail';
}

function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-6">
        <Pulse className="h-8 w-48" />
        <Pulse className="h-10 w-32 rounded-lg" />
      </div>
      {/* Filter/search bar */}
      <div className="flex gap-3 mb-4">
        <Pulse className="h-10 flex-1 max-w-xs rounded-lg" />
        <Pulse className="h-10 w-28 rounded-lg" />
        <Pulse className="h-10 w-28 rounded-lg" />
      </div>
      {/* List rows */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-4 bg-white/60 rounded-xl border border-gray-100"
        >
          <Pulse className="h-10 w-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Pulse className="h-4 w-3/4" />
            <Pulse className="h-3 w-1/2" />
          </div>
          <Pulse className="h-8 w-20 rounded-lg flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <Pulse className="h-8 w-64 mb-2" />
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 bg-white/60 rounded-xl border border-gray-100 space-y-3">
            <Pulse className="h-4 w-20" />
            <Pulse className="h-8 w-16" />
            <Pulse className="h-3 w-24" />
          </div>
        ))}
      </div>
      {/* Chart placeholders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="p-6 bg-white/60 rounded-xl border border-gray-100 space-y-4">
            <Pulse className="h-5 w-32" />
            <Pulse className="h-40 w-full rounded-lg" />
          </div>
        ))}
      </div>
      {/* Recent items list */}
      <div className="p-6 bg-white/60 rounded-xl border border-gray-100 space-y-3">
        <Pulse className="h-5 w-40 mb-2" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Pulse className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Pulse className="h-4 w-2/3" />
              <Pulse className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Back button + title */}
      <div className="flex items-center gap-3 mb-4">
        <Pulse className="h-8 w-8 rounded-lg" />
        <Pulse className="h-7 w-64" />
      </div>
      {/* Main content card */}
      <div className="p-6 bg-white/60 rounded-xl border border-gray-100 space-y-4">
        <Pulse className="h-6 w-1/2" />
        <Pulse className="h-4 w-full" />
        <Pulse className="h-4 w-full" />
        <Pulse className="h-4 w-3/4" />
      </div>
      {/* Secondary info blocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-white/60 rounded-xl border border-gray-100 space-y-3">
          <Pulse className="h-5 w-28" />
          <Pulse className="h-4 w-full" />
          <Pulse className="h-4 w-2/3" />
        </div>
        <div className="p-4 bg-white/60 rounded-xl border border-gray-100 space-y-3">
          <Pulse className="h-5 w-28" />
          <Pulse className="h-4 w-full" />
          <Pulse className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton({ variant }: PageSkeletonProps) {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {variant === 'list' && <ListSkeleton />}
      {variant === 'dashboard' && <DashboardSkeleton />}
      {variant === 'detail' && <DetailSkeleton />}
    </div>
  );
}
