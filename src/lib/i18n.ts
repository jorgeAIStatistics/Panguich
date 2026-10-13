export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Cookie that remembers the person's language choice across the site and owner workspace. */
export const LOCALE_COOKIE = "pg_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** A piece of copy available in both languages. */
export type Bilingual = Record<Locale, string>;

/** Picks the first supported language from an Accept-Language header. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** BCP 47 tag used for number/date formatting. */
export function intlLocale(locale: Locale): string {
  return locale === "es" ? "es-US" : "en-US";
}

/**
 * Whether a request is a person actually opening a page, as opposed to the browser or the
 * framework fetching it in the background. Only a real visit may change the remembered language:
 * a background prefetch of a link to /en must not switch a Spanish reader to English.
 */
export function isRealPageVisit(headers: { get(name: string): string | null }): boolean {
  if (headers.get("next-router-prefetch") || headers.get("next-router-segment-prefetch")) return false;
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`.toLowerCase();
  if (purpose.includes("prefetch") || purpose.includes("prerender")) return false;
  // Browsers label top-level navigations as "document". Older clients send nothing; accept those.
  const destination = headers.get("sec-fetch-dest");
  return destination === null || destination === "document";
}
