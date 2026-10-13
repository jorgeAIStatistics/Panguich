import type { MetadataRoute } from "next";
import { siteUrl } from "@/content/business";
import { isIndexingAllowed } from "@/lib/demo";

/**
 * Search engines are blocked by default. Panguich already has two public domains; this build
 * must not become a third competing one. Indexing is opened only with the owner's approval
 * (PANGUICH_ALLOW_INDEXING=1 on a non-demo build) as part of a planned migration.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexingAllowed()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/owner", "/api"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
