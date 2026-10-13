import Link from "next/link";
import { SITE_EVENT_TYPES } from "@/db/schema";
import type { OwnerDict } from "@/lib/owner/i18n";
import type { GrowthDict } from "../i18n";
import type { GrowthActivity } from "../service";
import styles from "./grow.module.css";

type Props = { activity: GrowthActivity; t: GrowthDict; shared: OwnerDict; demoMode: boolean };

/**
 * What the website itself has recorded. These are taps and page views, in this environment.
 * They are never called orders, sales, revenue or visits, and the missing sales data is said
 * out loud instead of being left blank.
 */
export function ActivityPanel({ activity, t, shared, demoMode }: Props) {
  const a = t.activity;
  const tooFew = (total: number) => total > 0 && total < activity.smallSampleThreshold;

  return (
    <section className="o-section" id="activity" aria-labelledby="activity-title" data-testid="activity-panel">
      <h2 id="activity-title">{a.title}</h2>
      <div className="o-stack">
        <div className="o-evidence">
          <p className="o-evidence__title">{shared.observed}</p>
          <p>
            <strong>{a.what}</strong> {a.notOrders}
          </p>
          {demoMode ? <p style={{ marginTop: "var(--s-2)" }}>{a.demo}</p> : null}
        </div>

        <div className="o-table-wrap">
          <table className="o-table" data-testid="activity-overall">
            <caption className="visually-hidden">{a.overall}</caption>
            <thead>
              <tr>
                <th scope="col">{a.whatCounted}</th>
                <th scope="col" className="is-num">
                  {a.count}
                </th>
              </tr>
            </thead>
            <tbody>
              {SITE_EVENT_TYPES.map((type) => (
                <tr key={type}>
                  <th scope="row" className={styles.rowHead}>
                    {a.events[type]}
                  </th>
                  <td className="is-num" data-event={type}>
                    {activity.overall[type]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {activity.overallTotal === 0 ? <p className="o-meta">{a.none}</p> : null}
        {tooFew(activity.overallTotal) ? (
          <p className="o-notice o-notice--warn" data-testid="too-few">
            {a.tooFew}
          </p>
        ) : null}

        <div>
          <h3 style={{ marginBottom: "var(--s-2)" }}>{a.byCampaign}</h3>
          {activity.byCampaign.length === 0 ? (
            <p className="o-meta">{a.noCampaignTaps}</p>
          ) : (
            <div className="o-table-wrap">
              <table className="o-table" data-testid="activity-by-campaign">
                <thead>
                  <tr>
                    <th scope="col">{t.index.code}</th>
                    {SITE_EVENT_TYPES.map((type) => (
                      <th scope="col" key={type} className="is-num">
                        {a.short[type]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.byCampaign.map((row) => (
                    <tr key={row.code}>
                      <td>
                        {row.campaignId ? (
                          <Link href={`/owner/grow/${row.campaignId}`}>
                            <strong className="o-num">{row.code}</strong>
                          </Link>
                        ) : (
                          <strong className="o-num">{row.code}</strong>
                        )}
                        <br />
                        <span className="o-meta">
                          {row.campaignName ?? a.unknownCode}
                          {row.isSynthetic ? ` · ${shared.sampleData}` : ""}
                          {tooFew(row.total) ? ` · ${a.tooFew}` : ""}
                        </span>
                      </td>
                      {SITE_EVENT_TYPES.map((type) => (
                        <td key={type} className="is-num">
                          {row.counts[type]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="o-empty" data-testid="orders-missing">
          <strong>{a.missing}</strong>
        </div>
      </div>
    </section>
  );
}
