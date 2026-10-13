import { BUSINESS } from "@/content/business";
import type { SiteCopy } from "@/content/site-copy";
import { ArrowIcon, BagIcon, PhoneIcon, PinIcon } from "./icons";

/**
 * Hand-off links. Each one is a plain link straight to the destination, so it works even if
 * this site's scripts or tracking fail. `data-track` only adds an anonymous tap count.
 */

type LinkProps = { t: SiteCopy; className?: string; label?: string; icon?: boolean };

/** Opens Panguich's hosted Toast ordering page. We never pre-fill or imitate a cart. */
export function OrderLink({ t, className = "s-btn s-btn--order", label, icon = true }: LinkProps) {
  return (
    <a className={className} href={BUSINESS.ordering.url} target="_blank" rel="noopener" data-track="order_handoff">
      {icon ? <BagIcon /> : null}
      {label ?? t.order}
      <span className="visually-hidden"> ({t.newTab})</span>
    </a>
  );
}

export function DirectionsLink({ t, className = "s-btn", label, icon = true }: LinkProps) {
  return (
    <a className={className} href={BUSINESS.links.directions} target="_blank" rel="noopener" data-track="directions_click">
      {icon ? <PinIcon /> : null}
      {label ?? t.directions}
      <span className="visually-hidden"> ({t.newTab})</span>
    </a>
  );
}

export function CallLink({ t, className = "s-btn", label, icon = true }: LinkProps) {
  return (
    <a className={className} href={`tel:${BUSINESS.phone.e164}`} data-track="call_click">
      {icon ? <PhoneIcon /> : null}
      {label ?? `${t.call} ${BUSINESS.phone.display}`}
    </a>
  );
}

export function MoreArrow() {
  return <ArrowIcon />;
}
