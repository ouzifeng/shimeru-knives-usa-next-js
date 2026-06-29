import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AffiliatePortal } from "@/components/affiliate-portal";
import { AffiliateBankForm } from "@/components/affiliate-bank-form";
import { AffiliateShippingForm } from "@/components/affiliate-shipping-form";

export const metadata: Metadata = {
  title: "Affiliate Portal",
  robots: { index: false, follow: false },
};

export default async function AffiliatePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { data: affiliate } = await getSupabaseAdmin()
    .from("affiliates")
    .select("name, status, code")
    .eq("access_token", token)
    .maybeSingle();

  if (!affiliate || affiliate.status === "rejected") {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="font-serif text-2xl font-light mb-3">Link not valid</h1>
        <p className="text-sm text-muted-foreground">
          This portal link is invalid or has expired. If you think this is a mistake, reply to your
          last email from us.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 lg:px-8 py-10 sm:py-14">
      <div className="max-w-6xl mx-auto">
      <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-2">
        Shimeru Knives Affiliates
      </p>
      <h1 className="font-serif text-3xl font-light tracking-tight mb-1">
        Hi {affiliate.name.split(/\s+/)[0]}
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Message us and upload content here for approval before you post it.
        {affiliate.code && (
          <>
            {" "}Your link:{" "}
            <span className="text-foreground">
              https://us.shimeruknives.co.uk/?ref={affiliate.code}
            </span>
          </>
        )}
      </p>

      <AffiliatePortal token={token} />

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <AffiliateBankForm token={token} />
        <AffiliateShippingForm token={token} />
      </div>
      </div>
    </div>
  );
}
