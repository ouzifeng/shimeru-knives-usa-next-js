import Link from "next/link";

export default function NotFound() {
  return (
    <section className="flex items-center justify-center min-h-[70vh]">
      <div className="text-center px-4">
        <p className="text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4">
          404
        </p>
        <h1 className="font-serif text-4xl lg:text-5xl font-light mb-4">
          Page Not Found
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto mb-10 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-6">
          <Link
            href="/product"
            className="inline-block bg-foreground text-background px-8 py-3.5 text-sm tracking-widest uppercase font-medium hover:opacity-90 transition-opacity"
          >
            Continue Shopping
          </Link>
          <Link
            href="/"
            className="text-sm tracking-wide uppercase text-primary hover:underline underline-offset-4"
          >
            Go Home
          </Link>
        </div>
      </div>
    </section>
  );
}
