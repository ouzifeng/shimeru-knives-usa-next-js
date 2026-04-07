export default function ProductListLoading() {
  return (
    <>
      {/* Header skeleton */}
      <div className="border-b border-border">
        <div className="container mx-auto px-4 lg:px-8 py-10">
          <div className="h-3 w-16 bg-muted animate-pulse mb-3" />
          <div className="h-9 w-48 bg-muted animate-pulse" />
        </div>
      </div>

      <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
        <div className="flex gap-8 lg:gap-12">
          {/* Sidebar skeleton */}
          <aside className="w-56 shrink-0 hidden lg:block space-y-8">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <div className="h-3 w-20 bg-muted animate-pulse mb-4" />
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="h-5 bg-muted/60 animate-pulse" style={{ width: `${50 + j * 10}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <div className="flex-1 min-w-0">
            <div className="h-4 w-24 bg-muted animate-pulse mb-6 lg:mb-8" />

            {/* Product grid skeleton */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {Array.from({ length: 9 }).map((_, i) => (
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
        </div>
      </div>
    </>
  );
}
