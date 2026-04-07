import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
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
    } = body;

    const envContent = `# Store
NEXT_PUBLIC_STORE_NAME=${storeName}
NEXT_PUBLIC_STORE_DESCRIPTION=${storeDescription}
NEXT_PUBLIC_CURRENCY=${currency}
NEXT_PUBLIC_CURRENCY_SYMBOL=${currencySymbol}
NEXT_PUBLIC_LOCALE=${locale}
NEXT_PUBLIC_HIDE_OUT_OF_STOCK=false

# WooCommerce
NEXT_PUBLIC_WORDPRESS_URL=${wordpressUrl}
WC_CONSUMER_KEY=${wcConsumerKey}
WC_CONSUMER_SECRET=${wcConsumerSecret}

# Supabase
NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonKey}
SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceRoleKey}

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${stripePublishableKey}
STRIPE_SECRET_KEY=${stripeSecretKey}
STRIPE_WEBHOOK_SECRET=${stripeWebhookSecret}

# Admin
ADMIN_PASSWORD=${adminPassword}

# Cron
CRON_SECRET=${cronSecret}
`;

    await writeFile(join(process.cwd(), ".env.local"), envContent, "utf-8");

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
