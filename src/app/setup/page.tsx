"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  ArrowLeft,
  ArrowRight,
  Store,
  Globe,
  Database,
  CreditCard,
  ShieldCheck,
  Rocket,
  Eye,
  EyeOff,
} from "lucide-react";

const TOTAL_STEPS = 6;

const STEP_META = [
  { label: "Store", icon: Store, color: "bg-sky-50 text-sky-600" },
  { label: "WooCommerce", icon: Globe, color: "bg-purple-50 text-purple-600" },
  { label: "Database", icon: Database, color: "bg-emerald-50 text-emerald-600" },
  { label: "Payments", icon: CreditCard, color: "bg-violet-50 text-violet-600" },
  { label: "Security", icon: ShieldCheck, color: "bg-amber-50 text-amber-600" },
  { label: "Launch", icon: Rocket, color: "bg-sky-50 text-sky-600" },
];

const CURRENCY_OPTIONS = [
  { value: "GBP", label: "GBP - British Pound", symbol: "\u00a3" },
  { value: "USD", label: "USD - US Dollar", symbol: "$" },
  { value: "EUR", label: "EUR - Euro", symbol: "\u20ac" },
];

const LOCALE_OPTIONS: Record<string, string> = {
  GBP: "en-GB",
  USD: "en-US",
  EUR: "de-DE",
};

type TestStatus = "idle" | "testing" | "success" | "error";

interface StepStatus {
  woocommerce: TestStatus;
  supabase: TestStatus;
  stripe: TestStatus;
}

function StatusFeedback({
  status,
  successMessage,
  errorMessage,
  children,
}: {
  status: TestStatus;
  successMessage?: string;
  errorMessage?: string;
  children?: React.ReactNode;
}) {
  if (status === "success" && (successMessage || children)) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <div>{successMessage || children}</div>
      </div>
    );
  }
  if (status === "error" && errorMessage) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        {errorMessage}
      </div>
    );
  }
  return null;
}

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [stepStatus, setStepStatus] = useState<StepStatus>({
    woocommerce: "idle",
    supabase: "idle",
    stripe: "idle",
  });

  // Step 1: Store Details
  const [storeName, setStoreName] = useState("My Store");
  const [storeDescription, setStoreDescription] = useState("Fast, modern shopping");
  const [currency, setCurrency] = useState("USD");
  const [locale, setLocale] = useState("en-US");

  // Step 2: WooCommerce
  const [wordpressUrl, setWordpressUrl] = useState("");
  const [wcConsumerKey, setWcConsumerKey] = useState("");
  const [wcConsumerSecret, setWcConsumerSecret] = useState("");
  const [wcProductCount, setWcProductCount] = useState<number | null>(null);
  const [wcError, setWcError] = useState("");

  // Step 3: Supabase
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [supabaseServiceRoleKey, setSupabaseServiceRoleKey] = useState("");
  const [hasSchema, setHasSchema] = useState(false);
  const [supabaseError, setSupabaseError] = useState("");
  const [migrationSql, setMigrationSql] = useState("");
  const [copiedSql, setCopiedSql] = useState(false);

  // Step 4: Stripe
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [stripeMode, setStripeMode] = useState<"test" | "live" | null>(null);
  const [stripeError, setStripeError] = useState("");

  // Step 5: Admin
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [cronSecret, setCronSecret] = useState("");

  // Step 6: Save & Import
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ synced: number } | null>(null);
  const [importError, setImportError] = useState("");
  const [importProgress, setImportProgress] = useState<{
    phase: string | null;
    synced: number;
    total: number;
  } | null>(null);

  const currencySymbol = CURRENCY_OPTIONS.find((c) => c.value === currency)?.symbol || "\u00a3";

  // Poll sync_state during import for progress
  const importSupabase = useMemo(() => {
    if (!supabaseUrl || !supabaseServiceRoleKey) return null;
    return createClient(supabaseUrl, supabaseServiceRoleKey);
  }, [supabaseUrl, supabaseServiceRoleKey]);

  useEffect(() => {
    if (!importing || !importSupabase) return;
    const interval = setInterval(async () => {
      const { data } = await importSupabase.from("sync_state").select("*").eq("id", 1).single();
      if (data) {
        setImportProgress({
          phase: data.sync_phase,
          synced: data.products_synced || 0,
          total: data.products_total || 0,
        });
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [importing, importSupabase]);

  useEffect(() => {
    setLocale(LOCALE_OPTIONS[currency] || "en-US");
  }, [currency]);

  useEffect(() => {
    setCronSecret(
      Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  }, []);

  const loadMigration = useCallback(async () => {
    if (migrationSql) return;
    try {
      const res = await fetch("/api/setup/migration");
      const data = await res.json();
      if (data.sql) setMigrationSql(data.sql);
    } catch {
      // Ignore
    }
  }, [migrationSql]);

  useEffect(() => {
    if (step === 3) loadMigration();
  }, [step, loadMigration]);

  async function testWooCommerce() {
    setStepStatus((s) => ({ ...s, woocommerce: "testing" }));
    setWcError("");
    try {
      const res = await fetch("/api/setup/test-woocommerce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: wordpressUrl,
          consumerKey: wcConsumerKey,
          consumerSecret: wcConsumerSecret,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStepStatus((s) => ({ ...s, woocommerce: "success" }));
        setWcProductCount(data.productCount);
      } else {
        setStepStatus((s) => ({ ...s, woocommerce: "error" }));
        setWcError(data.error);
      }
    } catch (err) {
      setStepStatus((s) => ({ ...s, woocommerce: "error" }));
      setWcError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  async function testSupabase() {
    setStepStatus((s) => ({ ...s, supabase: "testing" }));
    setSupabaseError("");
    try {
      const res = await fetch("/api/setup/test-supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: supabaseUrl,
          anonKey: supabaseAnonKey,
          serviceRoleKey: supabaseServiceRoleKey,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStepStatus((s) => ({ ...s, supabase: "success" }));
        setHasSchema(data.hasSchema);
      } else {
        setStepStatus((s) => ({ ...s, supabase: "error" }));
        setSupabaseError(data.error);
      }
    } catch (err) {
      setStepStatus((s) => ({ ...s, supabase: "error" }));
      setSupabaseError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  async function testStripe() {
    setStepStatus((s) => ({ ...s, stripe: "testing" }));
    setStripeError("");
    try {
      const res = await fetch("/api/setup/test-stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publishableKey: stripePublishableKey,
          secretKey: stripeSecretKey,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStepStatus((s) => ({ ...s, stripe: "success" }));
        setStripeMode(data.mode);
      } else {
        setStepStatus((s) => ({ ...s, stripe: "error" }));
        setStripeError(data.error);
      }
    } catch (err) {
      setStepStatus((s) => ({ ...s, stripe: "error" }));
      setStripeError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  async function copySql() {
    await navigator.clipboard.writeText(migrationSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  }

  async function saveConfig() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/setup/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName,
          storeDescription,
          currency,
          currencySymbol,
          locale,
          wordpressUrl,
          wcConsumerKey,
          wcConsumerSecret,
          supabaseUrl,
          supabaseAnonKey,
          supabaseServiceRoleKey,
          stripePublishableKey,
          stripeSecretKey,
          stripeWebhookSecret,
          adminPassword,
          cronSecret,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaved(true);
      } else {
        setSaveError(data.error || "Failed to save configuration");
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function importProducts() {
    setImporting(true);
    setImportError("");
    try {
      const res = await fetch("/api/setup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supabaseUrl,
          supabaseServiceRoleKey,
          wordpressUrl,
          wcConsumerKey,
          wcConsumerSecret,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setImportResult({ synced: data.synced });
      } else {
        setImportError(data.error || "Import failed");
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function StatusIcon({ status }: { status: TestStatus }) {
    if (status === "testing") return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
    if (status === "success") return <CheckCircle2 className="size-4 text-emerald-600" />;
    if (status === "error") return <AlertCircle className="size-4 text-rose-500" />;
    return null;
  }

  function StepIndicator() {
    return (
      <div className="mb-8">
        <div className="flex items-start">
          {STEP_META.map((meta, i) => {
            const stepNum = i + 1;
            const isActive = stepNum === step;
            const isCompleted = stepNum < step;
            return (
              <React.Fragment key={stepNum}>
                {i > 0 && (
                  <div className="mt-4 flex-1 px-1">
                    <div
                      className={`h-0.5 rounded-full transition-colors ${
                        isCompleted ? "bg-sky-500" : "bg-border"
                      }`}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setStep(stepNum)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div
                    className={`flex size-8 items-center justify-center rounded-full text-sm font-medium transition-all ${
                      isActive
                        ? "bg-sky-500 text-white ring-4 ring-sky-500/20"
                        : isCompleted
                          ? "bg-sky-500 text-white"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? <Check className="size-4" /> : stepNum}
                  </div>
                  <span
                    className={`hidden text-xs font-medium sm:block ${
                      isActive
                        ? "text-sky-600"
                        : isCompleted
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    {meta.label}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  function StepHeader({
    stepIndex,
    title,
    description,
    statusKey,
  }: {
    stepIndex: number;
    title: string;
    description: string;
    statusKey?: keyof StepStatus;
  }) {
    const meta = STEP_META[stepIndex];
    const Icon = meta.icon;
    return (
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${meta.color}`}>
            <Icon className="size-5" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              {title}
              {statusKey && <StatusIcon status={stepStatus[statusKey]} />}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
    );
  }

  function renderStep1() {
    return (
      <Card>
        <StepHeader stepIndex={0} title="Store Details" description="Basic information about your store" />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="storeName">Store Name</Label>
            <Input
              id="storeName"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="My Store"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="storeDescription">Description</Label>
            <Input
              id="storeDescription"
              value={storeDescription}
              onChange={(e) => setStoreDescription(e.target.value)}
              placeholder="Fast, modern shopping"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({opt.symbol})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="locale">Locale</Label>
            <Input
              id="locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              placeholder="en-US"
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderStep2() {
    return (
      <Card>
        <StepHeader
          stepIndex={1}
          title="WooCommerce"
          description="Connect to your WordPress store"
          statusKey="woocommerce"
        />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wordpressUrl">WordPress URL</Label>
            <Input
              id="wordpressUrl"
              value={wordpressUrl}
              onChange={(e) => setWordpressUrl(e.target.value)}
              placeholder="https://your-store.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wcConsumerKey">Consumer Key</Label>
            <Input
              id="wcConsumerKey"
              value={wcConsumerKey}
              onChange={(e) => setWcConsumerKey(e.target.value)}
              placeholder="ck_xxxxx"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wcConsumerSecret">Consumer Secret</Label>
            <Input
              id="wcConsumerSecret"
              type="password"
              value={wcConsumerSecret}
              onChange={(e) => setWcConsumerSecret(e.target.value)}
              placeholder="cs_xxxxx"
            />
          </div>
          <Button
            onClick={testWooCommerce}
            disabled={!wordpressUrl || !wcConsumerKey || !wcConsumerSecret || stepStatus.woocommerce === "testing"}
            variant="outline"
          >
            {stepStatus.woocommerce === "testing" && <Loader2 className="size-4 animate-spin" />}
            Test Connection
          </Button>
          <StatusFeedback
            status={stepStatus.woocommerce}
            successMessage={`Connected! Found ${wcProductCount} product${wcProductCount !== 1 ? "s" : ""}.`}
            errorMessage={wcError}
          />
        </CardContent>
      </Card>
    );
  }

  function renderStep3() {
    return (
      <Card>
        <StepHeader
          stepIndex={2}
          title="Supabase"
          description="Connect your database for product caching"
          statusKey="supabase"
        />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="supabaseUrl">Supabase URL</Label>
            <Input
              id="supabaseUrl"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://xxxxx.supabase.co"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supabaseAnonKey">Anon Key</Label>
            <Input
              id="supabaseAnonKey"
              value={supabaseAnonKey}
              onChange={(e) => setSupabaseAnonKey(e.target.value)}
              placeholder="eyJxxxxx"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supabaseServiceRoleKey">Service Role Key</Label>
            <Input
              id="supabaseServiceRoleKey"
              type="password"
              value={supabaseServiceRoleKey}
              onChange={(e) => setSupabaseServiceRoleKey(e.target.value)}
              placeholder="eyJxxxxx"
            />
          </div>
          <Button
            onClick={testSupabase}
            disabled={!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || stepStatus.supabase === "testing"}
            variant="outline"
          >
            {stepStatus.supabase === "testing" && <Loader2 className="size-4 animate-spin" />}
            Test Connection
          </Button>
          {stepStatus.supabase === "success" && (
            <div className="space-y-3">
              <StatusFeedback status="success" successMessage="Connected successfully!" />
              {hasSchema ? (
                <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-3.5 py-2.5 text-sm text-sky-700">
                  <CheckCircle2 className="size-4 shrink-0" />
                  Schema detected &mdash; migration already applied
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
                    <AlertCircle className="size-4 shrink-0" />
                    Schema not found. Run this migration in the Supabase SQL Editor:
                  </div>
                  {migrationSql && (
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
                        <span className="text-xs text-slate-400">SQL Migration</span>
                        <Button
                          onClick={copySql}
                          variant="ghost"
                          size="xs"
                          className="text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                          {copiedSql ? <Check className="size-3" /> : <Copy className="size-3" />}
                          {copiedSql ? "Copied" : "Copy"}
                        </Button>
                      </div>
                      <pre className="max-h-64 overflow-auto p-4 text-xs leading-relaxed text-slate-50">
                        {migrationSql}
                      </pre>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    After running the migration, click &quot;Test Connection&quot; again to verify.
                  </p>
                </div>
              )}
            </div>
          )}
          <StatusFeedback status={stepStatus.supabase} errorMessage={supabaseError} />
        </CardContent>
      </Card>
    );
  }

  function renderStep4() {
    return (
      <Card>
        <StepHeader
          stepIndex={3}
          title="Stripe"
          description="Connect Stripe for payment processing"
          statusKey="stripe"
        />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stripePublishableKey">Publishable Key</Label>
            <Input
              id="stripePublishableKey"
              value={stripePublishableKey}
              onChange={(e) => setStripePublishableKey(e.target.value)}
              placeholder="pk_test_xxxxx"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stripeSecretKey">Secret Key</Label>
            <Input
              id="stripeSecretKey"
              type="password"
              value={stripeSecretKey}
              onChange={(e) => setStripeSecretKey(e.target.value)}
              placeholder="sk_test_xxxxx"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stripeWebhookSecret">Webhook Secret</Label>
            <Input
              id="stripeWebhookSecret"
              type="password"
              value={stripeWebhookSecret}
              onChange={(e) => setStripeWebhookSecret(e.target.value)}
              placeholder="whsec_xxxxx"
            />
            <p className="text-xs text-muted-foreground">
              Create a webhook in{" "}
              <a
                href="https://dashboard.stripe.com/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Stripe Dashboard → Developers → Webhooks
              </a>
              . Set the endpoint URL to <code className="rounded bg-muted px-1 py-0.5">your-domain.com/api/webhooks/stripe</code> and
              listen for <code className="rounded bg-muted px-1 py-0.5">checkout.session.completed</code>.
              Copy the signing secret here.
            </p>
          </div>
          <Button
            onClick={testStripe}
            disabled={!stripePublishableKey || !stripeSecretKey || stepStatus.stripe === "testing"}
            variant="outline"
          >
            {stepStatus.stripe === "testing" && <Loader2 className="size-4 animate-spin" />}
            Test Connection
          </Button>
          {stepStatus.stripe === "success" && (
            <StatusFeedback status="success">
              Connected!{" "}
              <span
                className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  stripeMode === "live"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {stripeMode} mode
              </span>
            </StatusFeedback>
          )}
          <StatusFeedback status={stepStatus.stripe} errorMessage={stripeError} />
        </CardContent>
      </Card>
    );
  }

  function renderStep5() {
    const passwordsMatch = adminPassword === adminPasswordConfirm;
    const showMismatch = adminPasswordConfirm.length > 0 && !passwordsMatch;

    return (
      <Card>
        <StepHeader
          stepIndex={4}
          title="Admin & Security"
          description="Set up admin access and cron authentication"
        />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adminPassword">Admin Password</Label>
            <div className="relative">
              <Input
                id="adminPassword"
                type={showAdminPassword ? "text" : "password"}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Choose a strong password"
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowAdminPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdminPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used to access the admin panel at /admin
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminPasswordConfirm">Confirm Password</Label>
            <div className="relative">
              <Input
                id="adminPasswordConfirm"
                type={showAdminPassword ? "text" : "password"}
                value={adminPasswordConfirm}
                onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                placeholder="Re-enter your password"
                className={`pr-9 ${showMismatch ? "border-rose-300 ring-2 ring-rose-100" : ""}`}
              />
              <button
                type="button"
                onClick={() => setShowAdminPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdminPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {showMismatch && (
              <p className="text-xs text-rose-500">Passwords do not match</p>
            )}
            {adminPasswordConfirm.length > 0 && passwordsMatch && (
              <p className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="size-3" />
                Passwords match
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cronSecret">Cron Secret</Label>
            <Input
              id="cronSecret"
              value={cronSecret}
              onChange={(e) => setCronSecret(e.target.value)}
              placeholder="Auto-generated"
            />
            <p className="text-xs text-muted-foreground">
              Used to authenticate cron job requests. Auto-generated for you.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderStep6() {
    return (
      <Card>
        <StepHeader
          stepIndex={5}
          title="Save & Launch"
          description="Review your configuration and import products"
        />
        <CardContent className="space-y-6">
          {/* Summary */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Configuration Summary</h3>
            <div className="divide-y rounded-lg border text-sm">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-muted-foreground">Store</span>
                <span className="font-medium">{storeName} ({currency})</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-muted-foreground">WooCommerce</span>
                <span className="flex items-center gap-2 font-medium">
                  {wordpressUrl || "Not set"}
                  <StatusIcon status={stepStatus.woocommerce} />
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-muted-foreground">Supabase</span>
                <span className="flex items-center gap-2 font-medium">
                  {supabaseUrl ? new URL(supabaseUrl).hostname : "Not set"}
                  <StatusIcon status={stepStatus.supabase} />
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-muted-foreground">Stripe</span>
                <span className="flex items-center gap-2 font-medium">
                  {stripeMode ? `${stripeMode} mode` : "Not tested"}
                  <StatusIcon status={stepStatus.stripe} />
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-muted-foreground">Admin</span>
                <span className="font-medium">{adminPassword ? "Password set" : "Not set"}</span>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">1. Save Configuration</h3>
            <Button
              onClick={saveConfig}
              disabled={saving || saved}
              className={saved ? "" : "bg-sky-500 text-white hover:bg-sky-600"}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saved ? (
                <>
                  <CheckCircle2 className="size-4" />
                  Configuration Saved
                </>
              ) : (
                "Save to .env.local"
              )}
            </Button>
            {saved && (
              <StatusFeedback status="success" successMessage="Configuration saved to .env.local" />
            )}
            {saveError && (
              <StatusFeedback status="error" errorMessage={saveError} />
            )}
          </div>

          {/* Import Button */}
          {saved && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">2. Import Products</h3>
              <p className="text-sm text-muted-foreground">
                This will sync all products from WooCommerce into Supabase.
              </p>
              <Button
                onClick={importProducts}
                disabled={importing || !!importResult}
                className={importResult ? "" : "bg-sky-500 text-white hover:bg-sky-600"}
              >
                {importing && <Loader2 className="size-4 animate-spin" />}
                {importResult ? (
                  <>
                    <CheckCircle2 className="size-4" />
                    Import Complete
                  </>
                ) : importing ? (
                  "Importing..."
                ) : (
                  "Import Products"
                )}
              </Button>
              {importing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {importProgress?.phase === "fetching"
                        ? "Fetching products from WooCommerce..."
                        : importProgress?.phase === "images"
                          ? "Downloading images to Supabase Storage..."
                          : importProgress?.phase === "writing"
                            ? "Writing to database..."
                            : "Starting import..."}
                    </span>
                    {importProgress && importProgress.total > 0 && (
                      <span className="tabular-nums font-medium">
                        {importProgress.synced} / {importProgress.total}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full bg-sky-500 transition-all duration-500 ${
                        importProgress?.phase === "images" || importProgress?.phase === "writing"
                          ? "animate-pulse"
                          : ""
                      }`}
                      style={{
                        width:
                          importProgress?.phase === "writing"
                            ? "90%"
                            : importProgress?.phase === "images"
                              ? "70%"
                              : importProgress?.total
                                ? `${Math.min(60, (importProgress.synced / importProgress.total) * 60)}%`
                                : "15%",
                      }}
                    />
                  </div>
                </div>
              )}
              {importResult && (
                <StatusFeedback
                  status="success"
                  successMessage={`Successfully synced ${importResult.synced} product${importResult.synced !== 1 ? "s" : ""}.`}
                />
              )}
              {importError && (
                <StatusFeedback status="error" errorMessage={importError} />
              )}
            </div>
          )}

          {/* Success state */}
          {importResult && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100">
                    <CheckCircle2 className="size-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-emerald-800">Setup Complete!</h3>
                    <p className="text-sm text-emerald-600">
                      Your store is configured and products are synced.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => (window.location.href = "/")}
                  >
                    Visit Store
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => (window.location.href = "/admin")}
                  >
                    Admin Panel
                  </Button>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <p className="text-sm text-amber-700">
                  <strong>Important:</strong> Restart your dev server for environment variable changes
                  to take effect. In production, redeploy your application.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Store Setup</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your headless WooCommerce storefront
          </p>
        </div>

        <StepIndicator />

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
        {step === 6 && renderStep6()}

        {/* Navigation */}
        <div className="mt-6 flex justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 1}
          >
            <ArrowLeft className="size-4" />
            Previous
          </Button>
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={step === TOTAL_STEPS || (step === 5 && (!adminPassword || adminPassword !== adminPasswordConfirm))}
            className="bg-sky-500 text-white hover:bg-sky-600"
          >
            Next
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
