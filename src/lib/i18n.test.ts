import { describe, expect, it } from "vitest";
import { isLocale, isRealPageVisit, localeFromAcceptLanguage, toLocale } from "./i18n";

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });

describe("language helpers", () => {
  it("accepts only supported languages", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(toLocale("pt")).toBe("en");
  });

  it("picks the first supported language a browser asks for", () => {
    expect(localeFromAcceptLanguage("es-PE,es;q=0.9,en;q=0.8")).toBe("es");
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9,es;q=0.5")).toBe("es");
    expect(localeFromAcceptLanguage("de-DE")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("en");
  });

  it("lets only a real page visit change the remembered language", () => {
    expect(isRealPageVisit(headers({ "sec-fetch-dest": "document" }))).toBe(true);
    expect(isRealPageVisit(headers({}))).toBe(true); // very old browsers send no hints
    // Background fetches of a link must never flip a Spanish reader to English.
    expect(isRealPageVisit(headers({ "next-router-prefetch": "1", "sec-fetch-dest": "empty" }))).toBe(false);
    expect(isRealPageVisit(headers({ "next-router-segment-prefetch": "/_tree" }))).toBe(false);
    expect(isRealPageVisit(headers({ "sec-purpose": "prefetch;prerender", "sec-fetch-dest": "document" }))).toBe(false);
    expect(isRealPageVisit(headers({ purpose: "prefetch" }))).toBe(false);
    expect(isRealPageVisit(headers({ "sec-fetch-dest": "empty" }))).toBe(false); // in-page data request
  });
});
