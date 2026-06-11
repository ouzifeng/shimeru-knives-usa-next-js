import type { Metadata } from "next";
import { AffiliateLoginForm } from "@/components/affiliate-login-form";

export const metadata: Metadata = {
  title: "Affiliate Login",
  description: "Log in to your Shimeru Knives affiliate portal.",
  alternates: { canonical: "/affiliate/login" },
};

export default function AffiliateLoginPage() {
  return (
    <div className="mx-auto max-w-md px-5 sm:px-6 py-16 sm:py-20">
      <h1 className="font-serif text-3xl font-light tracking-tight mb-3">Affiliate Login</h1>
      <p className="text-sm leading-relaxed text-foreground/80 mb-8">
        Enter the email you applied with and we&apos;ll send you a link to your portal. No password
        needed.
      </p>

      <AffiliateLoginForm />

      <p className="mt-8 text-sm text-muted-foreground">
        Not an affiliate yet?{" "}
        <a
          href="/affiliate/apply"
          className="text-primary underline underline-offset-2 hover:text-primary/80"
        >
          Apply here
        </a>
        .
      </p>
    </div>
  );
}
