export default function HomeLoading() {
  return (
    <>
      {/* Hero skeleton */}
      <div className="bg-foreground/5">
        <div className="container mx-auto px-4 lg:px-8 py-24 lg:py-36">
          <div className="max-w-2xl space-y-6">
            <div className="h-3 w-32 bg-muted animate-pulse" />
            <div className="space-y-3">
              <div className="h-12 lg:h-16 w-3/4 bg-muted animate-pulse" />
              <div className="h-12 lg:h-16 w-1/2 bg-muted/70 animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full max-w-md bg-muted/50 animate-pulse" />
              <div className="h-4 w-3/4 max-w-md bg-muted/50 animate-pulse" />
            </div>
            <div className="flex gap-4 pt-2">
              <div className="h-12 w-40 bg-muted animate-pulse" />
              <div className="h-12 w-40 bg-muted/60 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Value props skeleton */}
      <div className="border-b border-border">
        <div className="container mx-auto px-4 lg:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="text-center space-y-2">
              <div className="h-5 w-28 bg-muted animate-pulse mx-auto" />
              <div className="h-3 w-36 bg-muted/50 animate-pulse mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Product grid skeleton */}
      <div className="container mx-auto px-4 lg:px-8 py-16 lg:py-24">
        <div className="flex items-end justify-between mb-10">
          <div className="space-y-2">
            <div className="h-3 w-24 bg-muted animate-pulse" />
            <div className="h-8 w-44 bg-muted animate-pulse" />
          </div>
          <div className="h-4 w-16 bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-square bg-muted animate-pulse mb-3" />
              <div className="space-y-2">
                <div className="h-4 bg-muted animate-pulse w-3/4" />
                <div className="h-3 bg-muted/60 animate-pulse w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
