import type { MetadataRoute } from "next";
import { siteUrl } from "@/content/business";
import { MENU_CHECKED_ON } from "@/content/menu";
import { LOCALES } from "@/lib/i18n";
import { SITE_PATHS } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  return SITE_PATHS.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${origin}/${locale}${path}`,
      lastModified: MENU_CHECKED_ON,
      alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${origin}/${l}${path}`])) },
    })),
  );
}
