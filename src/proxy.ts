import { NextResponse, type NextRequest } from "next/server";
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from "@/lib/i18n";

const PUBLIC_PAGES = new Set(["/", "/menu", "/catering", "/visit"]);
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Language routing for the public website.
 *  - "/" and un-prefixed pages (e.g. a campaign link to /menu?c=CODE) go to the visitor's
 *    language, keeping the query string.
 *  - Visiting /en/... or /es/... remembers that choice.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (isLocale(first)) {
    const response = NextResponse.next();
    if (request.cookies.get(LOCALE_COOKIE)?.value !== first) {
      response.cookies.set(LOCALE_COOKIE, first, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
    }
    return response;
  }

  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (PUBLIC_PAGES.has(normalized)) {
    const remembered = request.cookies.get(LOCALE_COOKIE)?.value;
    const locale: Locale = isLocale(remembered) ? remembered : localeFromAcceptLanguage(request.headers.get("accept-language"));
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${normalized === "/" ? "" : normalized}`;
    return NextResponse.redirect(url, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/menu", "/catering", "/visit", "/en/:path*", "/es/:path*", "/en", "/es"],
};
