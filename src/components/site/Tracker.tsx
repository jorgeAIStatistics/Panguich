"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { Locale } from "@/lib/i18n";

const CODE = /^[A-Z0-9][A-Z0-9-]{1,31}$/;
const CODE_KEY = "pg_campaign";

/** Respect browser privacy signals: no events at all when the visitor has opted out. */
function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1";
}

function campaignCode(): string | undefined {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("c");
    if (fromUrl && CODE.test(fromUrl)) sessionStorage.setItem(CODE_KEY, fromUrl);
    return sessionStorage.getItem(CODE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function send(type: string, locale: Locale): void {
  try {
    const body = JSON.stringify({
      clientEventId: crypto.randomUUID(),
      type,
      locale,
      path: window.location.pathname,
      campaignCode: campaignCode(),
    });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/events", blob)) {
      void fetch("/api/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    // Tracking must never get in the way of the visitor.
  }
}

/**
 * Counts anonymous taps on links marked `data-track` and views of pages marked
 * `data-track-view`. The links themselves are ordinary links and work without this.
 */
export function Tracker({ locale }: { locale: Locale }) {
  const pathname = usePathname();

  useEffect(() => {
    if (optedOut()) return;
    campaignCode();
    const view = document.querySelector("[data-track-view]")?.getAttribute("data-track-view");
    if (view) send(view, locale);
  }, [pathname, locale]);

  useEffect(() => {
    if (optedOut()) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("[data-track]") : null;
      const type = target?.getAttribute("data-track");
      if (type) send(type, locale);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [locale]);

  return null;
}
