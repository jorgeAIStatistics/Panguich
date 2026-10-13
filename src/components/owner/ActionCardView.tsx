import Link from "next/link";
import type { ActionCard } from "@/lib/action-card";
import type { OwnerDict } from "@/lib/owner/i18n";

/** One Today card: the fact, where it came from, how fresh it is, what we don't know, and the next step. */
export function ActionCardView({ card, rank, t }: { card: ActionCard; rank: number; t: OwnerDict }) {
  return (
    <article className={`o-card o-action o-stack o-stack--tight${card.synthetic ? " o-card--synthetic" : ""}`} data-testid="today-card" data-card-id={card.id}>
      <div className="o-row o-row--between">
        <span className="o-action__rank">
          {rank} · {t.nav[card.module === "growth" ? "grow" : card.module === "business" ? "settings" : card.module]}
        </span>
        <span className="o-row">
          {card.synthetic ? <span className="o-badge o-badge--synthetic">{t.sampleData}</span> : null}
          <span className={`o-badge ${card.basis === "observed" ? "o-badge--outline" : "o-badge--warn"}`}>
            {card.basis === "observed" ? t.observed : t.estimate}
          </span>
        </span>
      </div>
      <h2 className="o-card__title">{card.title}</h2>
      <p className="o-action__why">{card.explanation}</p>
      <dl className="o-facts">
        <dt>{t.source}</dt>
        <dd>{card.source}</dd>
        <dt>{t.freshness}</dt>
        <dd>{card.freshness}</dd>
        {card.uncertainty ? (
          <>
            <dt>{t.notKnown}</dt>
            <dd>{card.uncertainty}</dd>
          </>
        ) : null}
      </dl>
      <Link className="o-btn o-btn--primary o-btn--block" href={card.nextAction.href}>
        {card.nextAction.label}
      </Link>
    </article>
  );
}
