"use client";

import { useActionState, useEffect, useRef } from "react";
import type { QuoteFormValues } from "../form-values";
import { saveQuoteAction } from "../owner-actions";
import type { QuoteFormState } from "../quote-form-state";
import styles from "./owner.module.css";

/** Plain strings only: this form runs in the browser and gets its words from the page. */
export type QuoteFormLabels = {
  hint: string;
  replaces: string | null;
  rows: string[];
  item: string;
  quantity: string;
  price: string;
  notes: string;
  validUntil: string;
  save: string;
  saving: string;
  checkRows: string;
  /** Words for each error code the form can show. */
  errors: Record<string, string>;
  unknownError: string;
};

type Props = { inquiryId: string; initialValues: QuoteFormValues; labels: QuoteFormLabels };

/**
 * Writes a new quote version. A fixed number of line rows, so it works without JavaScript.
 * The subtotal is not typed in: the server calculates it from the lines.
 */
export function QuoteForm({ inquiryId, initialValues, labels }: Props) {
  const initial: QuoteFormState = { attempt: 0, values: initialValues, errors: {} };
  const [state, formAction, pending] = useActionState(saveQuoteAction, initial);
  const alertRef = useRef<HTMLDivElement>(null);
  const words = (code: string | undefined) => (code ? (labels.errors[code] ?? labels.unknownError) : null);

  const rowErrors = state.errors.rows ?? {};
  const topMessage = words(state.failure) ?? words(state.errors.form) ?? (Object.keys(rowErrors).length > 0 ? labels.checkRows : null);

  useEffect(() => {
    if (state.attempt > 0) alertRef.current?.focus();
  }, [state]);

  return (
    <form key={state.attempt} action={formAction} className="o-stack" noValidate aria-busy={pending} data-testid="quote-form">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <p className="o-meta">{labels.hint}</p>
      {topMessage ? (
        <div className="o-notice o-notice--danger" ref={alertRef} tabIndex={-1} role="alert">
          {topMessage}
        </div>
      ) : null}

      <div>
        {state.values.rows.map((row, index) => {
          const error = words(rowErrors[index]);
          const errorId = `quote-row-${index}-error`;
          return (
            <fieldset key={index} className={styles.quoteRow} aria-describedby={error ? errorId : undefined}>
              <legend>{labels.rows[index]}</legend>
              <div className={styles.quoteRowFields}>
                <div className="o-field">
                  <label htmlFor={`quote-description-${index}`}>{labels.item}</label>
                  <input
                    className="o-input"
                    id={`quote-description-${index}`}
                    name={`description_${index}`}
                    type="text"
                    autoComplete="off"
                    maxLength={200}
                    defaultValue={row.description}
                    aria-invalid={error ? true : undefined}
                  />
                </div>
                <div className="o-field">
                  <label htmlFor={`quote-quantity-${index}`}>{labels.quantity}</label>
                  <input
                    className="o-input"
                    id={`quote-quantity-${index}`}
                    name={`quantity_${index}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={7}
                    defaultValue={row.quantity}
                    aria-invalid={error ? true : undefined}
                  />
                </div>
                <div className="o-field">
                  <label htmlFor={`quote-price-${index}`}>{labels.price}</label>
                  <input
                    className="o-input"
                    id={`quote-price-${index}`}
                    name={`price_${index}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    maxLength={14}
                    defaultValue={row.price}
                    aria-invalid={error ? true : undefined}
                  />
                </div>
              </div>
              {error ? (
                <p className="o-error" id={errorId}>
                  {error}
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      <div className="o-field">
        <label htmlFor="quote-notes">{labels.notes}</label>
        <textarea
          className="o-textarea"
          id="quote-notes"
          name="notes"
          maxLength={1000}
          defaultValue={state.values.notes}
          aria-invalid={state.errors.notes ? true : undefined}
          aria-describedby={state.errors.notes ? "quote-notes-error" : undefined}
        />
        {state.errors.notes ? (
          <p className="o-error" id="quote-notes-error">
            {words(state.errors.notes)}
          </p>
        ) : null}
      </div>
      <div className="o-field">
        <label htmlFor="quote-valid-until">{labels.validUntil}</label>
        <input
          className="o-input"
          id="quote-valid-until"
          name="validUntil"
          type="date"
          defaultValue={state.values.validUntil}
          aria-invalid={state.errors.validUntil ? true : undefined}
          aria-describedby={state.errors.validUntil ? "quote-valid-until-error" : undefined}
        />
        {state.errors.validUntil ? (
          <p className="o-error" id="quote-valid-until-error">
            {words(state.errors.validUntil)}
          </p>
        ) : null}
      </div>

      {labels.replaces ? <p className="o-meta">{labels.replaces}</p> : null}
      <div>
        <button className="o-btn o-btn--primary" type="submit" disabled={pending}>
          {pending ? labels.saving : labels.save}
        </button>
      </div>
    </form>
  );
}
