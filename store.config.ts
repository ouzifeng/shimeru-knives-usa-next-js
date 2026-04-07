// ============================================================================
// Store Configuration
// ============================================================================
// All store settings in one place. Override any value via environment variables
// or edit the defaults directly below.
//
// After changing values here, restart your dev server.
// In production, set environment variables and redeploy.
// ============================================================================

export const storeConfig = {
  // --------------------------------------------------------------------------
  // Store Identity
  // --------------------------------------------------------------------------
  name: process.env.NEXT_PUBLIC_STORE_NAME || "Store",
  description: process.env.NEXT_PUBLIC_STORE_DESCRIPTION || "Fast, modern shopping",

  // --------------------------------------------------------------------------
  // Currency & Locale
  // --------------------------------------------------------------------------
  // Supported currencies: any ISO 4217 code (GBP, USD, EUR, AUD, CAD, etc.)
  // The symbol is used for display, the code for Stripe/API calls.
  // Locale controls number formatting (decimal separators, grouping).
  currency: process.env.NEXT_PUBLIC_CURRENCY || "USD",
  currencySymbol: process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "$",
  locale: process.env.NEXT_PUBLIC_LOCALE || "en-US",

  // --------------------------------------------------------------------------
  // Product Display
  // --------------------------------------------------------------------------
  hideOutOfStock: process.env.NEXT_PUBLIC_HIDE_OUT_OF_STOCK === "true",

  // --------------------------------------------------------------------------
  // Site URL (required for canonical URLs, sitemaps, JSON-LD)
  // --------------------------------------------------------------------------
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",

  // --------------------------------------------------------------------------
  // Sync
  // --------------------------------------------------------------------------
  // How often the cron job syncs products from WooCommerce (in minutes).
  // Set up a cron job hitting /api/cron/sync with your CRON_SECRET.
  syncIntervalMinutes: 5,
};

// ============================================================================
// Typography
// ============================================================================
// Change fonts by importing from "next/font/google" in src/app/layout.tsx.
// Examples:
//
//   import { DM_Sans } from "next/font/google";
//   const font = DM_Sans({ subsets: ["latin"] });
//
//   import { Plus_Jakarta_Sans } from "next/font/google";
//   const font = Plus_Jakarta_Sans({ subsets: ["latin"] });
//
//   import { Outfit } from "next/font/google";
//   const font = Outfit({ subsets: ["latin"] });
//
// Then use font.className on <body> in layout.tsx.
// Browse fonts: https://fonts.google.com

// ============================================================================
// Colors & Appearance
// ============================================================================
// Colors are defined in src/app/globals.css using CSS custom properties.
// The theme uses oklch() color space for perceptual uniformity.
//
// Quick guide to customizing:
//
//   --primary          → Buttons, links, active states
//   --secondary        → Secondary buttons, subtle backgrounds
//   --accent           → Hover states, highlights
//   --destructive      → Error states, delete actions
//   --background       → Page background
//   --foreground       → Main text color
//   --muted            → Subtle backgrounds (badges, code blocks)
//   --muted-foreground → Secondary text, placeholders
//   --border           → Borders, dividers
//   --radius           → Base border radius (scales up/down automatically)
//
// To add a brand color, change --primary in both :root (light) and .dark.
// Example — blue brand:
//   :root { --primary: oklch(0.55 0.2 250); }
//   .dark { --primary: oklch(0.7 0.15 250); }
//
// oklch reference: https://oklch.com
