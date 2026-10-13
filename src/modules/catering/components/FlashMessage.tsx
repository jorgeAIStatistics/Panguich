import type { DetailSection, Flash } from "./detail-view";

/**
 * Shows the result of the last action inside the section it belongs to (or at the top of the
 * page when `at` is null), so the message is in view after the page scrolls to that section.
 */
export function FlashMessage({ flash, at }: { flash: Flash | null | undefined; at: DetailSection | null }) {
  if (!flash || flash.at !== at) return null;
  return flash.tone === "danger" ? (
    <p className="o-notice o-notice--danger" role="alert" data-testid="catering-error">
      {flash.text}
    </p>
  ) : (
    <p className="o-notice o-notice--ok" role="status" data-testid="catering-notice">
      {flash.text}
    </p>
  );
}
