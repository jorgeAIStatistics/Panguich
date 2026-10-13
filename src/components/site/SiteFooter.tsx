import Link from "next/link";
import { BUSINESS, fullAddress } from "@/content/business";
import { MENU_CHECKED_ON } from "@/content/menu";
import { fill, type SiteCopy } from "@/content/site-copy";
import type { Locale } from "@/lib/i18n";
import { formatIsoDate } from "@/lib/time";

export function SiteFooter({ locale, t, demo }: { locale: Locale; t: SiteCopy; demo: boolean }) {
  const checked = formatIsoDate(MENU_CHECKED_ON, locale, { month: "long", day: "numeric", year: "numeric" });
  return (
    <footer className="s-footer">
      <div className="manta" aria-hidden="true" style={{ marginBottom: "var(--s-6)", marginTop: "calc(var(--s-6) * -1)" }} />
      <div className="s-wrap">
        <div className="s-footer__grid">
          <div>
            <h2>{t.footer.visit}</h2>
            <address style={{ fontStyle: "normal", lineHeight: 1.5 }}>
              Panguich
              <br />
              {fullAddress()}
            </address>
            <ul style={{ marginTop: "var(--s-2)" }}>
              <li>
                <a href={`tel:${BUSINESS.phone.e164}`} data-track="call_click">
                  {BUSINESS.phone.display}
                </a>
              </li>
              <li>
                <a href={BUSINESS.links.directions} target="_blank" rel="noopener" data-track="directions_click">
                  {t.directions}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h2>{t.footer.order}</h2>
            <ul>
              <li>
                <a href={BUSINESS.ordering.url} target="_blank" rel="noopener" data-track="order_handoff">
                  {t.order} (Toast)
                </a>
              </li>
              <li>
                <a href={BUSINESS.ordering.url} target="_blank" rel="noopener" data-track="delivery_handoff">
                  {t.delivery} (Toast)
                </a>
              </li>
              <li>
                <Link href={`/${locale}/catering`}>{t.nav.catering}</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>{t.footer.more}</h2>
            <ul>
              <li>
                <Link href={`/${locale}/menu`}>{t.nav.menu}</Link>
              </li>
              <li>
                <a href={BUSINESS.links.instagram} target="_blank" rel="noopener">
                  Instagram
                </a>
              </li>
              <li>
                <a href={BUSINESS.links.facebook} target="_blank" rel="noopener">
                  Facebook
                </a>
              </li>
              {demo ? (
                <li>
                  <Link href="/owner">{t.footer.owner}</Link>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
        <div className="s-footer__fine">
          <p>{BUSINESS.allergyNotice[locale]}</p>
          {demo ? <p>{fill(t.footer.fine1, { date: checked })}</p> : null}
          {demo ? <p>{t.footer.fine2}</p> : null}
          <p>{fill(t.footer.rights, { year: MENU_CHECKED_ON.slice(0, 4) })}</p>
        </div>
      </div>
    </footer>
  );
}
