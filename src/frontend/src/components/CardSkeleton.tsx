// Card-shaped shimmer placeholders for marketplace + rentals feeds.
//
// One component, three variants — each mirrors the outer shape and
// internal block positions of the corresponding real card, so switching
// from skeleton → real data DOESN'T shift the layout by a pixel:
//
//   • 'marketplace-product' — grid cell, aspect-square cover +
//     title/price/CTA lines. Used inside the same
//     `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`
//     the real ProductCard renders in.
//   • 'rentals-feed'        — horizontal card, 122px cover on left +
//     kicker/title/price/chips column on right. min-h-[148px] matches
//     the real card's minimum. Used inside the feed's
//     `flex flex-col gap-4 px-5`.
//   • 'rentals-mine'        — horizontal card, 92px square cover on
//     left + kicker/title/meta/price column + border-top actions row.
//     Matches MineCard.
//
// Colours: `bg-gray-200` for pulse blocks and `bg-white` for card
// containers — same palette PageSkeleton uses and the same the real
// cards use. `.marketplace-page` dark-mode overrides at index.css:2883+
// convert these to the correct dark surface tokens automatically, so a
// separate dark variant isn't needed here.
//
// Animation: Tailwind's built-in `animate-pulse` (opacity 0.5 ↔ 1,
// 2s ease-in-out infinite). Respects `prefers-reduced-motion`
// implicitly via the Tailwind base.

interface CardSkeletonProps {
  variant: 'marketplace-product' | 'rentals-feed' | 'rentals-mine';
  count?: number;                                            // default 5
  className?: string;                                        // for wrapper grid/list container
}

function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

function MarketplaceProductSkeleton() {
  // Mirrors ProductCard's outer shell: rounded-[18px] white surface,
  // aspect-square image well, p-3 body with title / price / CTA.
  return (
    <div className="bg-white rounded-[18px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="aspect-square bg-gray-200 animate-pulse" />
      <div className="p-3 space-y-2">
        <Pulse className="h-3 w-full" />
        <Pulse className="h-3 w-3/4" />
        <Pulse className="h-3 w-1/2 mt-2" />
        <Pulse className="h-4 w-2/3 mt-2" />
        <Pulse className="h-9 w-full rounded-[12px] mt-2" />
      </div>
    </div>
  );
}

function RentalsFeedSkeleton() {
  // Mirrors RentalsFeedPage's ListingCard: rounded-[20px] white card,
  // min-h-[148px], 122px cover on the left, kicker/title/price/chips
  // column on the right.
  return (
    <div
      className="rounded-[20px] bg-white overflow-hidden"
      style={{ boxShadow: '0 12px 30px -16px rgba(28,25,23,0.30)' }}
    >
      <div className="flex min-h-[148px]">
        <div className="flex-shrink-0 w-[122px] bg-gray-200 animate-pulse" />
        <div className="flex-1 min-w-0 p-3.5 flex flex-col">
          <Pulse className="h-3 w-2/3" />                    {/* kicker */}
          <Pulse className="h-4 w-3/4 mt-2" />                {/* rooms/title line 1 */}
          <Pulse className="h-3 w-1/2 mt-1.5" />              {/* meta */}
          <div className="mt-auto flex items-end justify-between gap-2 pt-3">
            <div className="space-y-1.5">
              <Pulse className="h-4 w-24" />                  {/* price */}
              <Pulse className="h-2.5 w-16" />                {/* «сум · мес» */}
            </div>
            <div className="flex gap-1">
              <Pulse className="h-5 w-12 rounded-full" />     {/* chip */}
              <Pulse className="h-5 w-10 rounded-full" />     {/* chip */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RentalsMineSkeleton() {
  // Mirrors MineCard: p-3 rounded-[20px] white with 92px square cover +
  // body column + border-top actions row.
  return (
    <div
      className="p-3 rounded-[20px] bg-white border border-gray-100"
      style={{ boxShadow: '0 12px 30px -16px rgba(28,25,23,0.30)' }}
    >
      <div className="w-full flex gap-3">
        <div className="flex-shrink-0 w-[92px] aspect-square rounded-[14px] bg-gray-200 animate-pulse" />
        <div className="flex-1 min-w-0 flex flex-col">
          <Pulse className="h-3 w-2/3" />                    {/* kicker */}
          <Pulse className="h-4 w-3/4 mt-1" />                {/* rooms + area */}
          <Pulse className="h-3 w-1/2 mt-1.5" />              {/* meta */}
          <div className="mt-auto pt-2 flex items-center gap-2">
            <Pulse className="h-4 w-20" />                    {/* price */}
            <Pulse className="h-2.5 w-14" />                  {/* «сум · мес» */}
          </div>
        </div>
      </div>
      <div className="pt-2.5 mt-2.5 border-t border-gray-100 flex gap-1">
        <Pulse className="h-8 flex-1 rounded-[10px]" />
        <Pulse className="h-8 flex-1 rounded-[10px]" />
        <Pulse className="h-8 flex-1 rounded-[10px]" />
      </div>
    </div>
  );
}

export function CardSkeleton({ variant, count = 5, className }: CardSkeletonProps) {
  // Default wrapper matches each variant's real container so callers
  // can drop the skeleton in the same slot without shifting siblings.
  const defaultWrapper =
    variant === 'marketplace-product'
      ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'
      : variant === 'rentals-feed'
        ? 'flex flex-col gap-4 px-5 pb-6'
        : 'flex flex-col gap-3';                             // rentals-mine

  const Skel =
    variant === 'marketplace-product' ? MarketplaceProductSkeleton
    : variant === 'rentals-feed'       ? RentalsFeedSkeleton
    :                                    RentalsMineSkeleton;

  return (
    <div className={className ?? defaultWrapper} aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => <Skel key={i} />)}
    </div>
  );
}
