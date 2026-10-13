import { formatUsd } from "@/lib/money";
import { formatInstant } from "@/lib/time";
import { describeCase, formatInvoiceDate } from "../format";
import styles from "./ops.module.css";
import type { OpsView } from "./view";

/**
 * The evidence behind an exception: the stored invoice lines, the arithmetic step by step,
 * what could make it wrong, and the documents exactly as they were received.
 */
export function EvidenceSection({ detail, t, shared, locale }: OpsView) {
  const d = t.detail;
  const { exception, lines, documents } = detail;
  const { evidence } = exception;

  return (
    <>
      <section className="o-section" id="lines" aria-labelledby="lines-title">
        <h2 id="lines-title">{d.linesTitle}</h2>
        <p className="o-meta" style={{ marginBottom: "var(--s-3)" }}>
          {d.linesLead}
        </p>
        <div className="o-table-wrap">
          <table className="o-table" data-testid="exception-lines">
            <thead>
              <tr>
                <th scope="col">{d.columns.invoice}</th>
                <th scope="col">{d.columns.item}</th>
                <th scope="col" className="is-num">
                  {d.columns.cases}
                </th>
                <th scope="col">{d.columns.pack}</th>
                <th scope="col" className="is-num">
                  {d.columns.casePrice}
                </th>
                <th scope="col" className="is-num">
                  {d.columns.amount}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const flagged = line.id === evidence.flaggedLineId;
                return (
                  <tr key={line.id} className={flagged ? "is-flagged" : undefined} data-testid={flagged ? "flagged-line" : "evidence-line"}>
                    <td>
                      <strong>{line.invoiceNumber}</strong>
                      <br />
                      <span className="o-meta">{formatInvoiceDate(line.invoiceDate, locale)}</span>
                      {flagged ? (
                        <>
                          <br />
                          {/* Said in words, not only with the row color. */}
                          <span className={styles.mark}>▸ {d.flagged}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {/* The supplier's own wording from the document. Displayed, never interpreted. */}
                      {line.rawDescription}
                      {line.isCredit ? <span className="o-meta"> · {d.creditLine}</span> : null}
                    </td>
                    <td className="is-num">{line.quantity}</td>
                    <td>{describeCase(line, locale)}</td>
                    <td className="is-num">{formatUsd(line.casePriceCents, locale)}</td>
                    <td className="is-num">{formatUsd(line.extendedCents, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="o-section" id="calculation" aria-labelledby="calculation-title">
        <h2 id="calculation-title">{d.calculationTitle}</h2>
        <div className={`o-card${exception.isSynthetic ? " o-card--synthetic" : ""}`}>
          <ol className={styles.steps} data-testid="calculation">
            {evidence.calculation.map((step, index) => (
              <li key={index}>
                <span className={styles.stepLabel}>{step.label[locale]}</span>
                <span className={styles.stepValue}>{step.value[locale]}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="o-section" id="caveats" aria-labelledby="caveats-title">
        <h2 id="caveats-title">{d.caveatsTitle}</h2>
        <div className="o-notice o-notice--warn">
          <ul className={styles.plainList} data-testid="caveats">
            {evidence.caveats.map((caveat, index) => (
              <li key={index}>{caveat[locale]}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="o-section" id="documents" aria-labelledby="documents-title">
        <h2 id="documents-title">{d.documentsTitle}</h2>
        <div className="o-stack">
          {documents.map((document) => (
            <div className="o-evidence" key={document.id} data-testid="raw-document">
              <p className="o-evidence__title">{d.documentLabel}</p>
              <p className="o-meta">
                <strong>{document.invoiceNumber}</strong> · {formatInvoiceDate(document.invoiceDate, locale)}
                {document.isSynthetic ? ` · ${shared.sampleData}` : ""}
                <br />
                {d.documentSource}: {document.sourceDocument}
                {document.importedAt ? (
                  <>
                    <br />
                    {d.documentAdded}: {formatInstant(document.importedAt, locale, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {document.importedByName ? ` · ${document.importedByName}` : ""}
                  </>
                ) : null}
              </p>
              {/*
                Untrusted text. React renders it as plain characters: no markup is interpreted,
                and nothing written in it is ever acted on.
              */}
              <pre className={styles.document} tabIndex={0} aria-label={`${d.documentLabel} ${document.invoiceNumber}`}>
                {document.rawText}
              </pre>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
