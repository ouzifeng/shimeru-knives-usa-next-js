# WooCommerce Next

A headless WooCommerce storefront built with Next.js 16, React 19, Supabase, and Stripe. Products are synced from WooCommerce into Supabase for fast querying, images are cached in Supabase Storage, and checkout is handled via Stripe Checkout Sessions.

## Features

- **Headless WooCommerce** — Products, categories, variations, and attributes synced via REST API
- **Supabase caching layer** — Fast product queries with full-text search, filtering by category/price/attributes, and pagination
- **Image CDN** — Product images are synced to Supabase Storage, avoiding Cloudflare bot protection issues
- **Stripe Checkout** — Secure payments via Stripe Checkout Sessions with webhook confirmation
- **AI-powered SEO** — Generate meta titles, descriptions, OpenGraph tags, and image alt texts using OpenAI, Anthropic, or DeepSeek
- **Admin panel** — Sync products, configure AI settings, generate SEO metadata, manage shipping
- **Setup wizard** — Guided first-run configuration with connection testing and initial import
- **Variable products** — Full support for WooCommerce product variations with attribute picker
- **Cart with Zustand** — Persistent client-side cart with coupon code support
- **Responsive design** — Mobile-first layout with shadcn/ui components and Tailwind CSS 4
- **Auto-sync** — Cron endpoint for scheduled product syncing (works with Vercel Cron)
- **Product status** — Only published products appear on the storefront
- **Full-text search** — PostgreSQL tsvector search across product names and descriptions
- **Currency formatting** — Configurable currency, symbol, and locale

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Storage | Supabase Storage |
| Payments | Stripe Checkout Sessions |
| Data Source | WooCommerce REST API v3 |
| State | Zustand |
| AI (optional) | OpenAI / Anthropic / DeepSeek |

## Prerequisites

- Node.js 18+
- A WooCommerce store with REST API credentials
- A Supabase project
- A Stripe account
- (Optional) An API key from OpenAI, Anthropic, or DeepSeek for AI SEO generation

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-username/woocommerce-next.git
cd woocommerce-next
npm install
```

### 2. Configure environment

Copy the example env file and fill in your credentials:

```bash
cp .env.local.example .env.local
```

See [Environment Variables](#environment-variables) below for details.

### 3. Set up the database

In your Supabase dashboard, go to **SQL Editor** and run the contents of:

```
supabase/migrations/001_initial_schema.sql
```

This creates all required tables, indexes, the storage bucket, and access policies.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first visit you'll be redirected to the **Setup Wizard** which will guide you through testing connections and importing products.

### 5. Admin panel

Visit [http://localhost:3000/admin](http://localhost:3000/admin) and log in with the `ADMIN_PASSWORD` you set. From here you can:

- Trigger manual product syncs
- Configure AI provider and generate SEO metadata
- View sync status and progress

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_STORE_NAME` | No | Store display name (default: "Store") |
| `NEXT_PUBLIC_STORE_DESCRIPTION` | No | Store tagline |
| `NEXT_PUBLIC_CURRENCY` | No | ISO 4217 currency code (default: "GBP") |
| `NEXT_PUBLIC_CURRENCY_SYMBOL` | No | Currency symbol (default: "£") |
| `NEXT_PUBLIC_LOCALE` | No | Locale for number formatting (default: "en-GB") |
| `NEXT_PUBLIC_HIDE_OUT_OF_STOCK` | No | Hide out-of-stock products (default: "false") |
| `NEXT_PUBLIC_WORDPRESS_URL` | **Yes** | Your WooCommerce store URL |
| `WC_CONSUMER_KEY` | **Yes** | WooCommerce REST API consumer key |
| `WC_CONSUMER_SECRET` | **Yes** | WooCommerce REST API consumer secret |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Supabase service role key (server-side only) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **Yes** | Stripe publishable key |
| `STRIPE_SECRET_KEY` | **Yes** | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | Stripe webhook signing secret |
| `ADMIN_PASSWORD` | **Yes** | Password for the admin panel |
| `CRON_SECRET` | No | Secret for the sync cron endpoint |

### Getting WooCommerce API Keys

1. In your WordPress admin, go to **WooCommerce → Settings → Advanced → REST API**
2. Click **Add key**, set permissions to **Read/Write**, and generate
3. Copy the Consumer Key and Consumer Secret

### Getting Supabase Keys

1. Go to your [Supabase dashboard](https://supabase.com/dashboard)
2. Select your project → **Settings → API**
3. Copy the Project URL, `anon` public key, and `service_role` key

### Getting Stripe Keys

1. Go to your [Stripe dashboard](https://dashboard.stripe.com/apikeys)
2. Copy the Publishable key and Secret key
3. For webhooks: **Developers → Webhooks → Add endpoint**
   - URL: `https://your-domain.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`
   - Copy the Signing secret

## Project Structure

```
├── src/
│   ├── app/                    # Next.js App Router pages & API routes
│   │   ├── admin/              # Admin panel
│   │   ├── setup/              # First-run setup wizard
│   │   ├── product/            # Product listing and detail pages
│   │   ├── checkout/           # Checkout page
│   │   ├── order-confirmation/ # Post-payment confirmation
│   │   └── api/                # API routes
│   │       ├── admin/          # Admin APIs (sync, settings, AI)
│   │       ├── checkout/       # Stripe checkout session creation
│   │       ├── webhooks/       # Stripe webhook handler
│   │       ├── setup/          # Setup wizard APIs
│   │       └── sync/           # Cron sync endpoint
│   ├── components/             # React components
│   │   └── ui/                 # shadcn/ui primitives
│   └── lib/                    # Shared utilities and data layer
│       ├── products.ts         # Supabase product queries
│       ├── sync.ts             # WooCommerce → Supabase sync logic
│       ├── image-sync.ts       # Image download & storage
│       ├── woocommerce.ts      # WooCommerce API client
│       ├── stripe.ts           # Stripe client
│       ├── supabase.ts         # Supabase clients
│       └── types.ts            # TypeScript interfaces
├── supabase/
│   └── migrations/             # Database schema SQL
├── store.config.ts             # Store configuration (name, currency, etc.)
├── vercel.json                 # Vercel deployment config with cron
└── .env.local.example          # Environment variable template
```

## Customization

### Store Config

Edit `store.config.ts` to change the store name, currency, locale, and other display settings. All values can be overridden via environment variables.

### Fonts

Change fonts in `src/app/layout.tsx` by importing from `next/font/google`. See examples in `store.config.ts`.

### Colors

Edit the CSS custom properties in `src/app/globals.css`. The theme uses `oklch()` color space. See `store.config.ts` for a guide to the available variables.

## Deployment

### Vercel (recommended)

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add all environment variables in the Vercel dashboard
4. The `vercel.json` includes a cron job that syncs products every 5 minutes

### Other platforms

Build and start:

```bash
npm run build
npm start
```

Set up a cron job to hit `GET /api/sync` with the header `Authorization: Bearer YOUR_CRON_SECRET` at your preferred interval.

## AI SEO Generation

The admin panel includes an AI-powered SEO generator that creates:

- **Meta title** (under 55 characters)
- **Meta description** (under 155 characters)
- **Focus keyword**
- **OpenGraph title and description**
- **Image alt texts**

### Setup

1. Go to **Admin → AI & SEO**
2. Select a provider (OpenAI, Anthropic, or DeepSeek)
3. Enter your API key
4. Select a model from the dynamically fetched list
5. Save settings
6. Click **Generate Product SEO** to process all products

SEO metadata is stored in the `product_seo` table and automatically used in page metadata and OpenGraph tags.

## License

MIT
