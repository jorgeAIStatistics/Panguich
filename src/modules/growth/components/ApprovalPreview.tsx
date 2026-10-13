import { LOCALES } from "@/lib/i18n";
import { formatUsd } from "@/lib/money";
import { shortReference } from "../approval";
import { datesPhrase, daysPhrase, longDate, windowPhrase } from "../schedule-text";
import styles from "./grow.module.css";
import type { GrowView } from "./view";

/**
 * "This is exactly what you are approving": the content an approval covers, in plain words,
 * drawn from the same record whose fingerprint is stored with the decision.
 */
export function ApprovalPreview({ view, t, shared, locale }: GrowView) {
  const { payload, payloadHash, campaign } = view;
  const p = t.preview;

  return (
    <section className="o-section" id="preview" aria-labelledby="preview-title">
      <h2 id="preview-title">{t.detail.previewTitle}</h2>
      <div className={`o-card o-stack${campaign.isSynthetic ? " o-card--synthetic" : ""}`} data-testid="approval-preview">
        <p className="o-muted" style={{ fontSize: "var(--text-sm)" }}>
          {t.detail.previewLead}
        </p>
        {campaign.isSynthetic ? (
          <p>
            <span className="o-badge o-badge--synthetic">{shared.sampleData}</span>
          </p>
        ) : null}

        <dl className="o-facts">
          <dt>{p.name}</dt>
          <dd>{payload.name}</dd>
          <dt>{t.detail.code}</dt>
          <dd className="o-num">{payload.code}</dd>
          <dt>{p.useCase}</dt>
          <dd>{t.useCase[payload.useCase].name}</dd>
          <dt>{p.objective}</dt>
          <dd>
            {t.objective[payload.objective]}
            <br />
            <span className="o-meta">{t.objectiveCounted[payload.objective]}</span>
          </dd>
          <dt>{p.audience}</dt>
          <dd>
            {payload.audience || "—"}
            <br />
            <span className="o-meta">{p.audienceHint}</span>
          </dd>
          <dt>{p.when}</dt>
          <dd>{p.whenValue(daysPhrase(payload.schedule.weekdays, locale), windowPhrase(payload.schedule, locale), datesPhrase(payload.schedule, locale))}</dd>

          <dt>{p.dishes}</dt>
          <dd>
            {payload.featuredItems.length === 0 ? (
              p.dishesNone
            ) : (
              <>
                <ul className={styles.plainList} style={{ paddingLeft: "var(--s-4)" }}>
                  {payload.featuredItems.map((item) => (
                    <li key={item.id}>
                      {item.name === null || item.priceCents === null ? (
                        <>
                          {item.id} — <strong>{p.unknownDish}</strong>
                        </>
                      ) : (
                        <>
                          {item.name} · <span className="o-num">{formatUsd(item.priceCents, locale)}</span> · {item.availability === "online" ? p.online : p.notOnline}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <span className="o-meta">{p.dishesAsOf(longDate(payload.menuCheckedOn, locale))}</span>
              </>
            )}
          </dd>

          <dt>{p.offer}</dt>
          <dd data-testid="preview-offer">
            {payload.offer.type === "none" ? (
              p.offerNone
            ) : (
              <>
                <strong>{p.offerLimited}:</strong> {payload.offer.description || <em>{p.missing}</em>}
                <br />
                {p.offerApplies}: {payload.offer.eligibleItems.map((item) => item.name ?? item.id).join(", ") || <em>{p.missing}</em>}
                <br />
                {p.offerExclusions}: {payload.offer.exclusions || <em>{p.missing}</em>}
                <br />
                {p.offerLimit}: {p.offerLimitValue(payload.offer.quantityLimit)}
                <br />
                {p.offerRedemption}: {payload.offer.redemptionControl || <em>{p.missing}</em>}
                <br />
                {p.offerMargin}: {payload.offer.contributionMarginNote ?? <em>{p.offerMarginUnknown}</em>}
              </>
            )}
          </dd>

          <dt>{p.budget}</dt>
          <dd data-testid="preview-budget">{payload.budgetCents > 0 ? p.budgetSome(formatUsd(payload.budgetCents, locale)) : p.budgetNone}</dd>

          <dt>{p.landing}</dt>
          <dd>
            {LOCALES.map((language) => (
              <span key={language} style={{ display: "block" }}>
                {t.languages[language]}: <span className="o-num">{payload.landing[language]}</span>
              </span>
            ))}
            <span className="o-meta">{p.landingNote}</span>
          </dd>

          <dt>{p.tracking}</dt>
          <dd>{payload.tracking[locale]}</dd>

          <dt>{p.channels}</dt>
          <dd>
            {payload.channels.map((entry) => (
              <span key={entry.channel} style={{ display: "block" }} data-testid="channel-state" data-state={entry.state}>
                {t.detail.channels[entry.channel]}: <strong>{t.detail.channelState}</strong>
              </span>
            ))}
          </dd>
        </dl>

        <div>
          <h3 style={{ marginBottom: "var(--s-3)" }}>{p.texts}</h3>
          {payload.creatives.map((creative) => (
            <div key={`${creative.kind}-${creative.locale}`} className={styles.exact}>
              <p className={styles.exactLabel}>
                {t.kinds[creative.kind]} · {t.languages[creative.locale]} · {t.origin[creative.origin]}
              </p>
              {/* Shown as plain text, exactly as stored. */}
              <pre className="o-pre" lang={creative.locale}>
                {creative.body}
              </pre>
            </div>
          ))}
        </div>

        <p className="o-meta">
          {t.detail.reference}:{" "}
          <span className={styles.reference} data-testid="approval-reference">
            {shortReference(payloadHash)}
          </span>
        </p>
      </div>
    </section>
  );
}
