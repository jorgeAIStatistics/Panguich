import type { SiteCopy } from "@/content/site-copy";
import { PhoneIcon, PinIcon } from "./icons";
import { BUSINESS } from "@/content/business";
import { OrderLink } from "./links";

/** Phone-only bar that keeps Order pickup, Directions and Call one tap away on every page. */
export function ActionBar({ t }: { t: SiteCopy }) {
  return (
    <div className="s-bar" role="group" aria-label={`${t.order} · ${t.directions} · ${t.call}`}>
      <OrderLink t={t} />
      <a className="s-btn s-bar__icon" href={BUSINESS.links.directions} target="_blank" rel="noopener" data-track="directions_click" aria-label={`${t.directions} (${t.newTab})`}>
        <PinIcon />
      </a>
      <a className="s-btn s-bar__icon" href={`tel:${BUSINESS.phone.e164}`} data-track="call_click" aria-label={`${t.call} ${BUSINESS.phone.display}`}>
        <PhoneIcon />
      </a>
    </div>
  );
}
