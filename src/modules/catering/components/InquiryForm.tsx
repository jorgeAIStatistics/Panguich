"use client";

import { useActionState, useEffect, useRef, type JSX } from "react";
import { BUSINESS } from "@/content/business";
import type { Locale } from "@/lib/i18n";
import { submitCateringInquiry } from "../actions";
import { CONSENT_DISCLOSURES } from "../consent-text";
import { inquiryFormCopy, type InquiryFormState } from "../form-copy";
import { EMPTY_INQUIRY_VALUES } from "../form-values";
import { fieldId, INQUIRY_FIELD_ORDER, InquiryFields, inquiryErrorText, type FieldSkin } from "./InquiryFields";
import styles from "./InquiryForm.module.css";

const INITIAL: InquiryFormState = { status: "idle", attempt: 0, values: EMPTY_INQUIRY_VALUES, errors: {} };
const ID_PREFIX = "cf";
/** Same key the website tracker uses to remember a campaign code for this visit. */
const CAMPAIGN_STORAGE_KEY = "pg_campaign";

const skin: FieldSkin = {
  section: styles.section,
  sectionTitle: styles.sectionTitle,
  grid: styles.grid,
  field: styles.field,
  label: styles.label,
  optional: styles.optional,
  input: styles.input,
  select: styles.input,
  textarea: `${styles.input} ${styles.textarea}`,
  hint: styles.hint,
  error: styles.error,
  fieldset: styles.fieldset,
  legend: styles.label,
  choices: styles.choices,
  choice: styles.choice,
};

/**
 * The public catering request form.
 *
 * Without JavaScript it is an ordinary form posting to the server; with JavaScript the same
 * post shows errors next to each field and a confirmation panel, and moves focus to them.
 * Sending the form saves a request. It is never a booking, and nothing is charged.
 */
export function CateringInquiryForm({ locale, campaignCode }: { locale: Locale; campaignCode?: string }): JSX.Element {
  const [state, formAction, pending] = useActionState(submitCateringInquiry, INITIAL);
  const t = inquiryFormCopy(locale);
  const phone = BUSINESS.phone.display;
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "success") successRef.current?.focus();
    else if (state.status === "invalid" || state.status === "failed") summaryRef.current?.focus();
  }, [state]);

  if (state.status === "success") {
    return (
      <div className={styles.root}>
        <div className={styles.success} ref={successRef} tabIndex={-1} role="status" data-testid="catering-success">
          <h3 className={styles.successTitle}>{t.success.title}</h3>
          <p className={styles.reference}>
            <span>{t.success.reference}</span>
            <strong data-testid="catering-reference">{state.reference}</strong>
          </p>
          <p>{t.success.notBooking}</p>
          <p>{t.success.change(phone)}</p>
          {state.demo ? (
            <p className={styles.demo} data-testid="catering-demo-note">
              {t.success.demo}
            </p>
          ) : null}
          {/* A plain form reloads the page, which clears the confirmation. Works without JavaScript. */}
          <form method="get" action={`/${locale}/catering`}>
            <button className={styles.secondary} type="submit">
              {t.success.again}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const errorFields = INQUIRY_FIELD_ORDER.filter((field) => state.errors[field]);
  const consentError = state.errors.consentContact;

  return (
    <div className={styles.root}>
      <form
        // A new key per response re-fills every field with what the person typed.
        key={state.attempt}
        action={formAction}
        className={styles.form}
        noValidate
        aria-busy={pending}
        data-testid="catering-form"
        onSubmit={(event) => {
          // Carry the visit's campaign code, if the page was opened from a campaign link.
          const field = event.currentTarget.elements.namedItem("campaign");
          if (field instanceof HTMLInputElement && !field.value) {
            try {
              field.value = window.sessionStorage.getItem(CAMPAIGN_STORAGE_KEY) ?? "";
            } catch {
              // Storage can be blocked; the request is sent without a campaign code.
            }
          }
        }}
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="campaign" defaultValue={campaignCode ?? ""} />

        {state.status === "invalid" && errorFields.length > 0 ? (
          <div className={styles.summary} ref={summaryRef} tabIndex={-1} role="alert" data-testid="catering-errors">
            <p className={styles.summaryTitle}>{t.errorSummary(errorFields.length)}</p>
            <ul>
              {errorFields.map((field) => {
                const code = state.errors[field];
                return code ? (
                  <li key={field}>
                    <a href={`#${fieldId(ID_PREFIX, field)}`}>{inquiryErrorText(t, "public", code)}</a>
                  </li>
                ) : null;
              })}
            </ul>
          </div>
        ) : null}
        {state.status === "failed" && state.failure ? (
          <div className={styles.summary} ref={summaryRef} tabIndex={-1} role="alert" data-testid="catering-failure">
            <p className={styles.summaryTitle}>{t.failures[state.failure](phone)}</p>
          </div>
        ) : null}

        <InquiryFields idPrefix={ID_PREFIX} mode="public" t={t} skin={skin} values={state.values} errors={state.errors} />

        <fieldset className={styles.fieldset} aria-describedby={consentError ? `${fieldId(ID_PREFIX, "consentContact")}-error` : undefined}>
          <legend className={styles.sectionTitle}>{t.consentLegend}</legend>
          <label className={styles.check}>
            <input
              type="checkbox"
              id={fieldId(ID_PREFIX, "consentContact")}
              name="consentContact"
              value="yes"
              required
              defaultChecked={state.values.consentContact}
              aria-invalid={consentError ? true : undefined}
              aria-describedby={consentError ? `${fieldId(ID_PREFIX, "consentContact")}-error` : undefined}
            />
            <span>
              {CONSENT_DISCLOSURES.transactional_contact[locale]} <span className={styles.optional}>({t.required})</span>
            </span>
          </label>
          {consentError ? (
            <p className={styles.error} id={`${fieldId(ID_PREFIX, "consentContact")}-error`}>
              {inquiryErrorText(t, "public", consentError)}
            </p>
          ) : null}
          {/* Separate, optional, and never ticked for the visitor. */}
          <label className={styles.check}>
            <input type="checkbox" id={fieldId(ID_PREFIX, "consentNews")} name="consentNews" value="yes" defaultChecked={state.values.consentNews} />
            <span>{CONSENT_DISCLOSURES.email_marketing[locale]}</span>
          </label>
        </fieldset>

        {/* Hidden from people; automated form fillers tend to complete it. */}
        <div className={styles.trap} aria-hidden="true">
          <label htmlFor={fieldId(ID_PREFIX, "website")}>{t.honeypot}</label>
          <input type="text" id={fieldId(ID_PREFIX, "website")} name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>

        <button className={styles.submit} type="submit" disabled={pending} data-testid="catering-submit">
          {pending ? t.sending : t.submit}
        </button>
      </form>
    </div>
  );
}
