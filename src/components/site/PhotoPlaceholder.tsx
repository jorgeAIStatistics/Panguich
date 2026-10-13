import type { SiteCopy } from "@/content/site-copy";

/**
 * A labeled stand-in for a photograph. It is deliberately impossible to mistake for a real
 * photo: no dish, portion, person or crowd is depicted. See docs/ASSETS.md.
 */
export function PhotoPlaceholder({ t, subject, variant }: { t: SiteCopy; subject: string; variant?: "wide" | "square" }) {
  return (
    <div className={`s-photo${variant ? ` s-photo--${variant}` : ""}`} role="img" aria-label={`${t.photo.placeholder}: ${subject}`}>
      <div className="s-photo__label">
        <strong>
          {t.photo.placeholder} · {subject}
        </strong>
        {t.photo.pending}
      </div>
    </div>
  );
}
