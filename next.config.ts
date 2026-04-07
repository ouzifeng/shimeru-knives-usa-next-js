import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:all*(svg|jpg|jpeg|png|webp|avif|ico|woff|woff2)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // WooCommerce shop page
      {
        source: "/shop",
        destination: "/product",
        permanent: true,
      },
      {
        source: "/shop/:path*",
        destination: "/product/:path*",
        permanent: true,
      },
      // WooCommerce category URLs
      {
        source: "/product-category/:slug",
        destination: "/product?category=:slug",
        permanent: true,
      },
      {
        source: "/product-category/:slug/",
        destination: "/product?category=:slug",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
