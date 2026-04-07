export default function ProductDetailLoading() {
  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
      {/* Breadcrumb skeleton */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-3 bg-muted animate-pulse" style={{ width: `${30 + i * 15}px` }} />
            {i < 3 && <span className="text-border">/</span>}
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
        {/* Image skeleton */}
        <div className="space-y-3">
          <div className="aspect-square bg-muted animate-pulse" />
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-18 h-18 bg-muted/70 animate-pulse shrink-0" />
            ))}
          </div>
        </div>

        {/* Info skeleton */}
        <div className="space-y-6 lg:py-4">
          <div className="h-3 w-20 bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="h-8 w-3/4 bg-muted animate-pulse" />
            <div className="h-8 w-1/2 bg-muted/60 animate-pulse" />
          </div>
          <div className="h-6 w-24 bg-muted animate-pulse" />
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-muted animate-pulse" />
            <div className="h-4 w-16 bg-muted animate-pulse" />
          </div>

          <div className="border-t border-border pt-6 space-y-3">
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-11 w-20 bg-muted animate-pulse" />
              ))}
            </div>
            <div className="h-14 w-full bg-muted animate-pulse" />
          </div>

          <div className="border-t border-border pt-6 space-y-3">
            <div className="h-3 w-24 bg-muted animate-pulse" />
            <div className="h-4 w-full bg-muted/50 animate-pulse" />
            <div className="h-4 w-full bg-muted/50 animate-pulse" />
            <div className="h-4 w-2/3 bg-muted/50 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
