import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/app/fonts";
import { getSessionUser } from "@/lib/auth/session";
import { getOwnerLocale } from "@/lib/owner/locale";
import "@/styles/tokens.css";
import "@/styles/owner.css";

export const metadata: Metadata = {
  title: { default: "Panguich · Owner workspace", template: "%s · Panguich" },
  // The workspace is private. Keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1c1512" };

export const dynamic = "force-dynamic";

export default async function OwnerRootLayout({ children }: { children: React.ReactNode }) {
  // The page language follows the signed-in person, so screen readers pronounce it correctly.
  const locale = await getOwnerLocale(await getSessionUser());
  return (
    <html lang={locale} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
