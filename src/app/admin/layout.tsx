"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, ArrowRight, LogOut, Loader2 } from "lucide-react";

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
    <div>
      <div className="mx-auto flex max-w-5xl items-center justify-end px-4 py-2">
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="size-3.5" />
          Sign out
        </Button>
      </div>
      {children}
    </div>
  );
}
