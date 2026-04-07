/* eslint-disable @next/next/no-img-element */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Shimeru Knives — Japanese Chef Knife"
      className={`h-10 lg:h-12 w-auto ${className}`}
    />
  );
}
