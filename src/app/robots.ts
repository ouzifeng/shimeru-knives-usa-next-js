import { MetadataRoute } from "next";
import { storeConfig } from "../../store.config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/setup", "/api", "/checkout", "/order-confirmation"],
    },
    sitemap: `${storeConfig.url}/sitemap.xml`,
  };
}
