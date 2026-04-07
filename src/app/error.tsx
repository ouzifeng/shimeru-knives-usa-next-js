"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="flex items-center justify-center min-h-[70vh]">
      <div className="text-center px-4">
        <p className="text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4">
          Error
        </p>
        <h1 className="font-serif text-4xl lg:text-5xl font-light mb-4">
          Something Went Wrong
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto mb-10 leading-relaxed">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={() => reset()}
          className="inline-block bg-foreground text-background px-8 py-3.5 text-sm tracking-widest uppercase font-medium hover:opacity-90 transition-opacity"
        >
          Try Again
        </button>
      </div>
    </section>
  );
}
