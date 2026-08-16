"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, ArrowRight, LogOut, Loader2 } from "lucide-react";
import { AdminSidebar, type AdminTab } from "@/components/admin/admin-sidebar";

const ADMIN_TABS: AdminTab[] = [
  "dashboard", "orders", "abandoned", "customers", "products", "inventory",
  "supplier-prices", "funnel", "returns", "waiting-stock", "ambassadors",
  "affiliates", "support", "email-logs", "email-templates", "email-marketing",
];

type SupportTicket = { status: string };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/auth")
      .then((res) => {
        if (res.ok) setAuthed(true);
      })
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = async () => {
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthed(true);
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setAuthed(false);
    setPassword("");
  };

  if (checking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-b from-sky-50 to-sky-100/80 ring-1 ring-sky-200/60">
              <Lock className="size-5 text-sky-600" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Admin Panel</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Enter your password to continue
            </p>
          </div>

          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className={error ? "border-rose-300 ring-2 ring-rose-100" : ""}
            />
            {error && (
              <p className="text-center text-sm text-rose-500">Incorrect password</p>
            )}
            <Button
              onClick={handleLogin}
              className="w-full bg-sky-500 text-white hover:bg-sky-600"
            >
              Sign in
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <AdminShell onLogout={handleLogout}>{children}</AdminShell>
    </Suspense>
  );
}

// Persistent admin chrome (header, sidebar nav, footer) shared by the main
// /admin SPA and every detail route (orders, customers). The sidebar drives
// navigation through the ?tab= query param so it works from any admin route.
function AdminShell({
  children,
  onLogout,
}: {
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  // Highlight the section that matches the current route. Detail routes map to
  // their parent tab; everything else reads the ?tab= param.
  const activeTab: AdminTab = pathname?.startsWith("/admin/orders")
    ? "orders"
    : pathname?.startsWith("/admin/customers")
      ? "customers"
      : (ADMIN_TABS as string[]).includes(tabParam ?? "")
        ? (tabParam as AdminTab)
        : "dashboard";

  const onChange = useCallback(
    (tab: AdminTab) => {
      router.push(tab === "dashboard" ? "/admin" : `/admin?tab=${tab}`);
    },
    [router],
  );

  const [pendingSupportCount, setPendingSupportCount] = useState(0);
  const refreshSupportCount = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/support/tickets");
      if (!res.ok) return;
      const data = (await res.json()) as SupportTicket[];
      setPendingSupportCount(data.filter((t) => t.status === "pending").length);
    } catch {
      // Silently ignore — count just won't update this cycle
    }
  }, []);

  useEffect(() => {
    refreshSupportCount();
  }, [refreshSupportCount, pathname, tabParam]);

  // The Support tab dispatches this when tickets change so the badge updates.
  useEffect(() => {
    const handler = () => refreshSupportCount();
    window.addEventListener("admin:support-changed", handler);
    return () => window.removeEventListener("admin:support-changed", handler);
  }, [refreshSupportCount]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2">
          <Link href="/admin" className="text-sm font-semibold tracking-tight">
            Shimeru Admin
          </Link>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-6">
        <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
          <AdminSidebar
            activeTab={activeTab}
            onChange={onChange}
            pendingSupportCount={pendingSupportCount}
          />
          <div className="min-w-0">{children}</div>
        </div>
      </div>

      <footer className="shrink-0 border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground">
          <span>Shimeru Knives admin</span>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            View store
          </a>
        </div>
      </footer>
    </div>
  );
}
