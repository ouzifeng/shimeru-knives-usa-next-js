import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AffiliateAgreementBody } from "@/components/affiliate-agreement-body";
import { AffiliateContractForm } from "@/components/affiliate-contract-form";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Affiliate Agreement — Shimeru Knives",
  robots: { index: false, follow: false },
};

type SocialChannel = { platform?: string; handle?: string };

function primaryChannel(channels: unknown): string | null {
  if (!Array.isArray(channels) || channels.length === 0) return null;
  const c = channels[0] as SocialChannel;
  if (!c?.handle) return null;
  return c.platform ? `${c.platform}: ${c.handle}` : c.handle;
}

export default async function AffiliateAgreementSignPage({ params }: PageProps) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const admin = getSupabaseAdmin();
  const { data: affiliate } = await admin
    .from("affiliates")
    .select(
      "id, name, email, country, social_channels, status, contract_signed_at, signed_name, access_token"
    )
    .eq("access_token", token)
    .maybeSingle();

  if (!affiliate) notFound();

  const alreadySigned = !!affiliate.contract_signed_at;

  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12 sm:py-16">
      <AffiliateAgreementBody
        affiliate={{
          name: affiliate.name,
          channel: primaryChannel(affiliate.social_channels),
          country: affiliate.country,
        }}
      />

      <div className="mt-10">
        {alreadySigned ? (
          <div className="rounded border border-emerald-200 bg-emerald-50 p-6 text-center">
            <p className="font-medium text-emerald-800">Already signed</p>
            <p className="text-sm text-emerald-700 mt-1">
              Signed by <strong>{affiliate.signed_name}</strong> on{" "}
              {new Date(affiliate.contract_signed_at!).toLocaleDateString("en-US", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              .
            </p>
          </div>
        ) : (
          <AffiliateContractForm token={token} expectedName={affiliate.name} />
        )}
      </div>
    </div>
  );
}
