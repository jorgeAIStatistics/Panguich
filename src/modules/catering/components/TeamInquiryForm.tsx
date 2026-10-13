"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import type { Locale } from "@/lib/i18n";
import { inquiryFormCopy, type InquiryFormState } from "../form-copy";
import type { InquiryFormValues } from "../form-values";
import { saveTeamInquiryAction } from "../owner-actions";
import { fieldId, INQUIRY_FIELD_ORDER, InquiryFields, inquiryErrorText, type FieldSkin } from "./InquiryFields";
import styles from "./owner.module.css";

const skin: FieldSkin = {
  section: styles.formSection,
  sectionTitle: styles.formSectionTitle,
  grid: "o-grid-2",
  field: "o-field",
  label: "o-label",
  optional: styles.optional,
  input: "o-input",
  select: "o-select",
  textarea: "o-textarea",
  hint: "o-meta",
  error: "o-error",
  fieldset: styles.fieldset,
  legend: "o-label",
  choices: styles.choices,
  choice: styles.choice,
};

const ID_PREFIX = "tf";

type Props = {
  /** The language of the workspace (the person filling the form). */
  locale: Locale;
  /** Set when editing a saved request. */
  inquiryId?: string;
  initialValues: InquiryFormValues;
  /** The language the customer speaks; the quote message is written in it. */
  customerLocale: Locale;
  cancelHref: string;
  cancelLabel: string;
};

/**
 * The team's form for a request that arrived by phone, in person or by email, and for
 * correcting a saved request. Works without JavaScript; with it, errors appear in place.
 */
export function TeamInquiryForm({ locale, inquiryId, initialValues, customerLocale, cancelHref, cancelLabel }: Props) {
  const initial: InquiryFormState = { status: "idle", attempt: 0, values: initialValues, errors: {} };
  const [state, formAction, pending] = useActionState(saveTeamInquiryAction, initial);
  const t = inquiryFormCopy(locale);
  const mode = inquiryId ? "team-edit" : "team-new";
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "invalid" || state.status === "failed") summaryRef.current?.focus();
  }, [state]);

  const errorFields = INQUIRY_FIELD_ORDER.filter((field) => state.errors[field]);

  return (
    <form key={state.attempt} action={formAction} className="o-card o-stack" noValidate aria-busy={pending} data-testid="team-inquiry-form">
      {inquiryId ? <input type="hidden" name="inquiryId" value={inquiryId} /> : null}

      {state.status === "invalid" && errorFields.length > 0 ? (
        <div className="o-notice o-notice--danger" ref={summaryRef} tabIndex={-1} role="alert">
          <strong>{t.errorSummary(errorFields.length)}</strong>
          <ul style={{ margin: "var(--s-2) 0 0", paddingLeft: "var(--s-5)" }}>
            {errorFields.map((field) => {
              const code = state.errors[field];
              return code ? (
                <li key={field}>
                  <a href={`#${fieldId(ID_PREFIX, field)}`}>{inquiryErrorText(t, mode, code)}</a>
                </li>
              ) : null;
            })}
          </ul>
        </div>
      ) : null}
      {state.status === "failed" && state.failure ? (
        <div className="o-notice o-notice--danger" ref={summaryRef} tabIndex={-1} role="alert">
          {t.failures[state.failure]("")}
        </div>
      ) : null}

      <InquiryFields
        idPrefix={ID_PREFIX}
        mode={mode}
        t={t}
        skin={skin}
        values={state.values}
        errors={state.errors}
        customerLocale={state.customerLocale ?? customerLocale}
      />

      {mode === "team-new" ? <p className="o-notice">{t.team.noConsent}</p> : null}

      <div className="o-row">
        <button className="o-btn o-btn--primary" type="submit" disabled={pending}>
          {pending ? t.sending : inquiryId ? t.team.update : t.team.create}
        </button>
        <Link className="o-btn o-btn--quiet" href={cancelHref}>
          {cancelLabel}
        </Link>
      </div>
    </form>
  );
}
