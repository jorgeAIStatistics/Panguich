import { MENU_CATEGORIES, MENU_CHECKED_ON, getMenuItem, itemsInCategory } from "@/content/menu";
import { CAMPAIGN_OBJECTIVES } from "@/db/schema";
import { formatUsd } from "@/lib/money";
import { weekdayName, type Weekday } from "@/lib/time";
import { saveCampaignAction } from "../actions";
import { datesPhrase, daysPhrase, longDate, publishedHoursPhrase, windowPhrase } from "../schedule-text";
import { LANDING_PATHS, MAX_FEATURED_ITEMS } from "../templates";
import styles from "./grow.module.css";
import type { GrowView } from "./view";

const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** Dollars as typed into the spend box: "0", "50.00". */
function dollarsText(cents: number): string {
  return cents === 0 ? "0" : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** What the campaign is, who it is for and when it runs. A form for people who can edit. */
export function PlanSection({ view, t, locale, perms }: GrowView) {
  const { campaign } = view;
  const f = t.form;
  const editable = perms.edit && campaign.status !== "archived";

  if (!editable) {
    return (
      <section className="o-section" id="plan" aria-labelledby="plan-title">
        <h2 id="plan-title">{t.detail.planTitle}</h2>
        <div className="o-card o-stack">
          <dl className="o-facts">
            <dt>{f.objective}</dt>
            <dd>{t.objective[campaign.objective]}</dd>
            <dt>{f.audience}</dt>
            <dd>{campaign.audience || "—"}</dd>
            <dt>{t.preview.when}</dt>
            <dd>
              {t.preview.whenValue(daysPhrase(campaign.schedule.weekdays, locale), windowPhrase(campaign.schedule, locale), datesPhrase(campaign.schedule, locale))}
            </dd>
            <dt>{f.featured}</dt>
            <dd>{campaign.featuredItemIds.map((id) => getMenuItem(id)?.name ?? id).join(", ") || t.preview.dishesNone}</dd>
          </dl>
          {perms.edit ? null : <p className="o-meta">{t.detail.readOnly}</p>}
        </div>
      </section>
    );
  }

  const offer = campaign.offer.type === "limited_test" ? campaign.offer : null;
  const limitMode = !offer || offer.quantityLimit === null ? "" : offer.quantityLimit === "no_limit" ? "no_limit" : "number";
  const selected = new Set(campaign.featuredItemIds);

  return (
    <section className="o-section" id="plan" aria-labelledby="plan-title">
      <h2 id="plan-title">{t.detail.planTitle}</h2>
      <form action={saveCampaignAction} className="o-card o-stack" data-testid="plan-form">
        <input type="hidden" name="campaignId" value={campaign.id} />

        <div className={styles.formPart}>
          <div className="o-field">
            <label htmlFor="plan-name">{f.name}</label>
            <input className="o-input" id="plan-name" name="name" defaultValue={campaign.name} maxLength={120} required />
          </div>
          <div className="o-field">
            <label htmlFor="plan-objective">{f.objective}</label>
            <select className="o-select" id="plan-objective" name="objective" defaultValue={campaign.objective} aria-describedby="plan-objective-hint">
              {CAMPAIGN_OBJECTIVES.map((objective) => (
                <option key={objective} value={objective}>
                  {t.objective[objective]}
                </option>
              ))}
            </select>
            <span className="o-hint" id="plan-objective-hint">
              {t.objectiveCounted[campaign.objective]}
            </span>
          </div>
          <div className="o-field">
            <label htmlFor="plan-landing">{f.landingPath}</label>
            <select className="o-select" id="plan-landing" name="landingPath" defaultValue={campaign.landingPath}>
              {LANDING_PATHS.map((path) => (
                <option key={path} value={path}>
                  {t.landing[path]}
                </option>
              ))}
            </select>
          </div>
          <div className="o-field">
            <label htmlFor="plan-audience">{f.audience}</label>
            <textarea
              className="o-textarea"
              id="plan-audience"
              name="audience"
              defaultValue={campaign.audience}
              maxLength={600}
              rows={3}
              aria-describedby="plan-audience-hint"
            />
            <span className="o-hint" id="plan-audience-hint">
              {f.audienceHint}
            </span>
          </div>
        </div>

        <div className={styles.formPart}>
          <div className={styles.pair}>
            <div className="o-field">
              <label htmlFor="plan-starts">{f.startsOn}</label>
              <input className="o-input" id="plan-starts" name="startsOn" type="date" defaultValue={campaign.schedule.startsOn} required />
            </div>
            <div className="o-field">
              <label htmlFor="plan-ends">{f.endsOn}</label>
              <input className="o-input" id="plan-ends" name="endsOn" type="date" defaultValue={campaign.schedule.endsOn} required />
            </div>
          </div>
          <fieldset className={styles.fieldset}>
            <legend>{f.weekdays}</legend>
            <div className={styles.choices}>
              {WEEK.map((day) => (
                <label key={day} className={styles.choice}>
                  <input type="checkbox" name="weekdays" value={day} defaultChecked={campaign.schedule.weekdays.includes(day)} />
                  {weekdayName(day, locale)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className={styles.pair}>
            <div className="o-field">
              <label htmlFor="plan-from">{f.startTime}</label>
              <input className="o-input" id="plan-from" name="startTime" type="time" defaultValue={campaign.schedule.startTime} required />
            </div>
            <div className="o-field">
              <label htmlFor="plan-to">{f.endTime}</label>
              <input className="o-input" id="plan-to" name="endTime" type="time" defaultValue={campaign.schedule.endTime} required />
            </div>
          </div>
          <p className="o-meta">{f.hoursHint(publishedHoursPhrase(locale))}</p>
        </div>

        <div className={styles.formPart}>
          <fieldset className={styles.fieldset}>
            <legend>{f.featured}</legend>
            <p className="o-meta">{f.featuredHint(MAX_FEATURED_ITEMS, longDate(MENU_CHECKED_ON, locale))}</p>
            <div className={styles.list}>
              {MENU_CATEGORIES.map((category) => {
                const items = itemsInCategory(category.id);
                const chosen = items.filter((item) => selected.has(item.id)).length;
                return (
                  <details key={category.id} className={styles.group} open={chosen > 0}>
                    <summary>
                      <span>{category.name[locale]}</span>
                      {chosen > 0 ? <span className="o-badge o-badge--ink">{f.chosen(chosen)}</span> : null}
                    </summary>
                    <div className={styles.groupBody}>
                      {items.map((item) => (
                        <label key={item.id} className={styles.choice}>
                          <input type="checkbox" name="featuredItemIds" value={item.id} defaultChecked={selected.has(item.id)} />
                          <span>
                            {item.name} · {formatUsd(item.priceCents, locale)}
                            {item.availability === "online" ? null : <span className={styles.choiceNote}> ({f.notOnline})</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className={styles.formPart}>
          <fieldset className={styles.fieldset}>
            <legend>{f.offerLegend}</legend>
            <div className={styles.choices}>
              <label className={styles.choice}>
                <input type="radio" name="offerType" value="none" defaultChecked={!offer} />
                {f.offerNone}
              </label>
              <label className={styles.choice}>
                <input type="radio" name="offerType" value="limited_test" defaultChecked={Boolean(offer)} />
                {f.offerLimited}
              </label>
            </div>
          </fieldset>
          <details className={styles.group} open={Boolean(offer)}>
            <summary>{f.offerLimited}</summary>
            <div className="o-stack" style={{ padding: "var(--s-3)", borderTop: "1px solid var(--line)" }}>
              <p className="o-meta">{f.offerLimitedHint}</p>
              <div className="o-field">
                <label htmlFor="offer-description">{f.offerDescription}</label>
                <input className="o-input" id="offer-description" name="offerDescription" defaultValue={offer?.description ?? ""} maxLength={500} />
              </div>
              <fieldset className={styles.fieldset}>
                <legend>{f.offerEligible}</legend>
                {campaign.featuredItemIds.length === 0 ? null : (
                  <div className={styles.choices}>
                    {campaign.featuredItemIds.map((id) => (
                      <label key={id} className={styles.choice}>
                        <input type="checkbox" name="offerEligibleItemIds" value={id} defaultChecked={offer?.eligibleItemIds.includes(id) ?? false} />
                        {getMenuItem(id)?.name ?? id}
                      </label>
                    ))}
                  </div>
                )}
                <p className="o-meta">{f.offerEligibleHint}</p>
              </fieldset>
              <div className="o-field">
                <label htmlFor="offer-exclusions">{f.offerExclusions}</label>
                <input
                  className="o-input"
                  id="offer-exclusions"
                  name="offerExclusions"
                  defaultValue={offer?.exclusions ?? ""}
                  maxLength={500}
                  aria-describedby="offer-exclusions-hint"
                />
                <span className="o-hint" id="offer-exclusions-hint">
                  {f.offerExclusionsHint}
                </span>
              </div>
              <div className={styles.pair}>
                <div className="o-field">
                  <label htmlFor="offer-limit-mode">{f.offerLimit}</label>
                  <select className="o-select" id="offer-limit-mode" name="offerLimitMode" defaultValue={limitMode}>
                    <option value="">{f.offerLimitUnset}</option>
                    <option value="number">{f.offerLimitNumber}</option>
                    <option value="no_limit">{f.offerLimitNone}</option>
                  </select>
                </div>
                <div className="o-field">
                  <label htmlFor="offer-limit-count">{f.offerLimitCount}</label>
                  <input
                    className="o-input"
                    id="offer-limit-count"
                    name="offerLimitCount"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    defaultValue={typeof offer?.quantityLimit === "number" ? String(offer.quantityLimit) : ""}
                  />
                </div>
              </div>
              <div className="o-field">
                <label htmlFor="offer-redemption">{f.offerRedemption}</label>
                <input
                  className="o-input"
                  id="offer-redemption"
                  name="offerRedemption"
                  defaultValue={offer?.redemptionControl ?? ""}
                  maxLength={500}
                  aria-describedby="offer-redemption-hint"
                />
                <span className="o-hint" id="offer-redemption-hint">
                  {f.offerRedemptionHint}
                </span>
              </div>
              <div className="o-field">
                <label htmlFor="offer-margin">{f.offerMargin}</label>
                <input
                  className="o-input"
                  id="offer-margin"
                  name="offerMargin"
                  defaultValue={offer?.contributionMarginNote ?? ""}
                  maxLength={500}
                  aria-describedby="offer-margin-hint"
                />
                <span className="o-hint" id="offer-margin-hint">
                  {f.offerMarginHint}
                </span>
              </div>
            </div>
          </details>
        </div>

        <div className={styles.formPart}>
          <div className="o-field">
            <label htmlFor="plan-budget">{f.budget}</label>
            <input
              className="o-input"
              id="plan-budget"
              name="budget"
              inputMode="decimal"
              defaultValue={dollarsText(campaign.budgetCents)}
              aria-describedby="plan-budget-hint"
            />
            <span className="o-hint" id="plan-budget-hint">
              {f.budgetHint}
            </span>
          </div>
          <button className="o-btn o-btn--primary o-btn--block" type="submit" data-testid="save-plan">
            {f.save}
          </button>
        </div>
      </form>
    </section>
  );
}
