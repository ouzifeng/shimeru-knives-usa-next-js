"use client";

import { usePathname } from "next/navigation";

// Public site chrome (header, footer) should not render on the /admin app
// shell, which has its own header and a fixed-height scroll area. Without this
// the footer bleeds in under the admin tables and cuts them off.
export function HideOnAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
