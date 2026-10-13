import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { requirePagePermission, toActor } from "@/lib/auth/session";
import { formatUsd } from "@/lib/money";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { formatInstant } from "@/lib/time";
import styles from "@/modules/operations/components/ops.module.css";
import { STATUS_BADGE } from "@/modules/operations/components/view";
import { formatInvoiceDate } from "@/modules/operations/format";
import { operationsDict } from "@/modules/operations/i18n";
import { LEDGER_STAGES, ledgerAmountCents } from "@/modules/operations/ledger";
import { getOperationsOverview } from "@/modules/operations/service";

export const metadata: Metadata = { title: "Operations" };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function OperationsPage({ searchParams }: Props) {
  // Staff do not see financial documents: they are sent away here, and the refusal is recorded.
  const user = await requirePagePermission("operations.view");
  const locale = await getOwnerLocale(user);
  const t = operationsDict(locale);
  const shared = ownerDict(locale);
  const query = await searchParams;

  const overview = await getOperationsOverview(await getDb(), toActor(user));
  const { exceptions, ledger, checked, invoices, suppliers } = overview;
  const errorText = query.error ? (t.errors[query.error] ?? null) : null;
  // The page says "everything is sample data" only while that is true.
  const hasRecords = exceptions.length + invoices.length > 0;
  const allSample =
    hasRecords && exceptions.every((exception) => exception.isSynthetic) && invoices.every((invoice) => invoice.isSynthetic) && checked.every((entry) => entry.isSynthetic);

  return (
    <>
      <header className="o-head">
        <p className="o-head__eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p>{t.lead}</p>
      </header>

      {allSample ? (
        <div className="o-notice o-notice--synthetic" role="note" data-testid="ops-sample-banner">
          <strong>{t.sampleBanner.title}</strong> {t.sampleBanner.body}
        </div>
      ) : null}
      {errorText ? (
        <p className="o-notice o-notice--danger" role="alert" data-testid="ops-error" style={{ marginTop: "var(--s-3)" }}>
          {errorText}
        </p>
      ) : null}

      <section className="o-section" aria-labelledby="queue-title">
        <h2 id="queue-title">{t.queue.title}</h2>
        {exceptions.length === 0 ? (
          <div className="o-empty">
            <strong>{t.queue.empty}</strong>
            {t.queue.emptyBody}
          </div>
        ) : (
          <div className="o-stack" data-testid="exception-queue">
            {exceptions.map((exception) => {
              const amount = ledgerAmountCents(exception);
              const credited = exception.status === "credit_received" || exception.status === "cash_recovered";
              return (
                <Link
                  key={exception.id}
                  href={`/owner/operations/exceptions/${exception.id}`}
                  className={`o-card o-card--link o-stack o-stack--tight${exception.isSynthetic ? " o-card--synthetic" : ""}`}
                  data-testid="exception-card"
                  data-status={exception.status}
                >
                  <div className={styles.cardTop}>
                    <span className="o-meta">
                      {t.queue.supplier}: {suppliers[exception.supplierId]?.name ?? exception.supplierId}
                    </span>
                    <span className="o-row">
                      {exception.isSynthetic ? <span className="o-badge o-badge--synthetic">{shared.sampleData}</span> : null}
                      <span className={`o-badge ${STATUS_BADGE[exception.status]}`}>{t.status[exception.status]}</span>
                    </span>
                  </div>
                  <h3 className="o-card__title">{exception.evidence.summary[locale]}</h3>
                  {exception.status === "dismissed" ? null : (
                    <p style={{ fontSize: "var(--text-sm)" }}>
                      {credited ? t.detail.credit : t.queue.amount}:{" "}
                      <strong className="o-num">{amount === null ? t.queue.amountUnknown : formatUsd(amount, locale)}</strong>
                      {credited ? null : <span className="o-muted"> · {t.queue.amountHint}</span>}
                    </p>
                  )}
                  <span className="o-strong" style={{ fontSize: "var(--text-sm)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                    {t.queue.open} →
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="o-section" aria-labelledby="ledger-title">
        <h2 id="ledger-title">{t.ledger.title}</h2>
        <p className="o-meta" style={{ marginBottom: "var(--s-3)" }}>
          {t.ledger.lead}
        </p>
        <div className="o-table-wrap">
          <table className="o-table" data-testid="ledger">
            <thead>
              <tr>
                <th scope="col">{t.ledger.columns.stage}</th>
                <th scope="col" className="is-num">
                  {t.ledger.columns.count}
                </th>
                <th scope="col" className="is-num">
                  {t.ledger.columns.amount}
                </th>
              </tr>
            </thead>
            <tbody>
              {LEDGER_STAGES.map((stage) => (
                <tr key={stage} data-testid={`ledger-${stage}`}>
                  <th scope="row" className={styles.rowHead}>
                    {t.ledger.stage[stage]}
                    <span className={styles.rowHint}>{t.ledger.stageHint[stage]}</span>
                  </th>
                  <td className="is-num">{ledger[stage].count}</td>
                  <td className="is-num">
                    {formatUsd(ledger[stage].amountCents, locale)}
                    {ledger[stage].unknownAmountCount > 0 ? <span className={styles.rowHint}>{t.ledger.unknown(ledger[stage].unknownAmountCount)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ledger.dismissedCount > 0 ? (
          <p className="o-meta" style={{ marginTop: "var(--s-2)" }}>
            {t.ledger.dismissed(ledger.dismissedCount)}
          </p>
        ) : null}
        {allSample && exceptions.length > 0 ? (
          <p className="o-meta" style={{ marginTop: "var(--s-2)" }}>
            <span className="o-badge o-badge--synthetic">{shared.sampleData}</span> {t.ledger.sampleNote}
          </p>
        ) : null}
      </section>

      <section className="o-section" aria-labelledby="checked-title">
        <h2 id="checked-title">{t.checked.title}</h2>
        <p className="o-meta" style={{ marginBottom: "var(--s-3)" }}>
          {t.checked.lead}
        </p>
        {checked.length === 0 ? (
          <p className="o-meta">{t.checked.empty}</p>
        ) : (
          <ul className={styles.list} data-testid="checked-list">
            {checked.map((entry) => (
              <li
                key={`${entry.supplierId}:${entry.productKey}`}
                className={`o-card o-card--flat${entry.isSynthetic ? " o-card--synthetic" : ""}`}
                data-outcome={entry.outcome}
                style={{ fontSize: "var(--text-sm)" }}
              >
                <strong>{t.checked.title}:</strong> {entry.summary[locale]}
                {entry.isSynthetic ? (
                  <>
                    {" "}
                    <span className="o-badge o-badge--synthetic">{shared.sampleData}</span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="o-section" aria-labelledby="invoices-title">
        <h2 id="invoices-title">{t.invoices.title}</h2>
        <p className="o-meta" style={{ marginBottom: "var(--s-3)" }}>
          {t.invoices.lead}
        </p>
        {invoices.length === 0 ? (
          <p className="o-meta">{t.invoices.empty}</p>
        ) : (
          <div className="o-table-wrap">
            <table className="o-table" data-testid="invoice-table">
              <thead>
                <tr>
                  <th scope="col">{t.invoices.columns.invoice}</th>
                  <th scope="col">{t.invoices.columns.date}</th>
                  <th scope="col" className="is-num">
                    {t.invoices.columns.total}
                  </th>
                  <th scope="col">{t.invoices.columns.source}</th>
                  <th scope="col">{t.invoices.columns.imported}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <strong>{invoice.invoiceNumber}</strong>
                      {invoice.isSynthetic ? (
                        <>
                          <br />
                          <span className="o-badge o-badge--synthetic">{shared.sampleData}</span>
                        </>
                      ) : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatInvoiceDate(invoice.invoiceDate, locale)}</td>
                    <td className="is-num">{formatUsd(invoice.totalCents, locale)}</td>
                    <td>
                      {invoice.sourceDocument}
                      <br />
                      <span className="o-meta">{suppliers[invoice.supplierId]?.name ?? invoice.supplierId}</span>
                    </td>
                    <td>
                      {invoice.importedAt ? formatInstant(invoice.importedAt, locale, { year: "numeric", month: "short", day: "numeric" }) : "—"}
                      {invoice.importedByName ? (
                        <>
                          <br />
                          <span className="o-meta">
                            {t.invoices.by} {invoice.importedByName}
                          </span>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="o-section" aria-labelledby="needed-title">
        <h2 id="needed-title">{t.needed.title}</h2>
        <div className="o-card" data-testid="needed-box">
          <p className="o-muted" style={{ fontSize: "var(--text-sm)" }}>
            {t.needed.lead}
          </p>
          <ul className={styles.needed}>
            {t.needed.items.map((item) => (
              <li key={item.name}>
                <span className={styles.neededText}>
                  <strong>{item.name}</strong>
                  <br />
                  <span className="o-muted">{item.why}</span>
                </span>
                <span className="o-badge o-badge--outline" data-testid="not-provided">
                  {t.needed.notProvided}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
