import type { Locale } from "@/lib/i18n";
import type { InquiryFormCopy } from "../form-copy";
import type { InquiryFormValues } from "../form-values";
import type { InquiryErrorCode } from "../schema";

/**
 * The fields of a catering request, shared by the public website form and the team's
 * "add / edit a request" form. Each caller passes its own class names (the public site and
 * the owner workspace use different stylesheets). Works without JavaScript: plain inputs
 * with labels, hints and errors tied to each field.
 */

export type FieldSkin = {
  section: string;
  sectionTitle: string;
  grid: string;
  field: string;
  label: string;
  optional: string;
  input: string;
  select: string;
  textarea: string;
  hint: string;
  error: string;
  fieldset: string;
  legend: string;
  choices: string;
  choice: string;
};

export type InquiryFieldsMode = "public" | "team-new" | "team-edit";

type Errors = Partial<Record<keyof InquiryFormValues, InquiryErrorCode>>;

type Props = {
  idPrefix: string;
  mode: InquiryFieldsMode;
  t: InquiryFormCopy;
  skin: FieldSkin;
  values: InquiryFormValues;
  errors: Errors;
  /** Team forms only: the language the customer speaks. */
  customerLocale?: Locale;
};

const STAFF_SOURCE_OPTIONS = ["phone", "walk_in", "email", "referral"] as const;

export function fieldId(idPrefix: string, field: string): string {
  return `${idPrefix}-${field}`;
}

/** The words for a field's error, using the team wording where it differs. */
export function inquiryErrorText(t: InquiryFormCopy, mode: InquiryFieldsMode, code: InquiryErrorCode): string {
  if (mode !== "public" && code in t.team.errors) return t.team.errors[code as keyof typeof t.team.errors];
  return t.errors[code];
}

export function inquiryFieldLabel(t: InquiryFormCopy, mode: InquiryFieldsMode, field: keyof InquiryFormCopy["fields"]): string {
  if (mode !== "public" && field in t.team.fields) return t.team.fields[field as keyof typeof t.team.fields];
  return t.fields[field];
}

function ids(...parts: Array<string | false | null | undefined>): string | undefined {
  const present = parts.filter(Boolean);
  return present.length > 0 ? present.join(" ") : undefined;
}

export function InquiryFields({ idPrefix, mode, t, skin, values, errors, customerLocale }: Props) {
  const isPublic = mode === "public";
  const id = (field: string) => fieldId(idPrefix, field);
  const hintId = (field: string) => `${id(field)}-hint`;
  const errorId = (field: string) => `${id(field)}-error`;
  const label = (field: keyof InquiryFormCopy["fields"]) => inquiryFieldLabel(t, mode, field);
  const auto = (token: string) => (isPublic ? token : "off");

  const error = (field: keyof InquiryFormValues) => {
    const code = errors[field];
    return code ? (
      <p className={skin.error} id={errorId(field)}>
        {inquiryErrorText(t, mode, code)}
      </p>
    ) : null;
  };
  const optional = <span className={skin.optional}> ({t.optional})</span>;
  const invalid = (field: keyof InquiryFormValues) => (errors[field] ? true : undefined);

  return (
    <>
      {!isPublic ? (
        <div className={skin.section}>
          <div className={skin.grid}>
            {mode === "team-new" ? (
              <div className={skin.field}>
                <label className={skin.label} htmlFor={id("source")}>
                  {t.fields.source}
                </label>
                <select
                  className={skin.select}
                  id={id("source")}
                  name="source"
                  defaultValue={values.source}
                  aria-invalid={invalid("source")}
                  aria-describedby={ids(errors.source && errorId("source"))}
                >
                  {STAFF_SOURCE_OPTIONS.map((source) => (
                    <option key={source} value={source}>
                      {t.sources[source]}
                    </option>
                  ))}
                </select>
                {error("source")}
              </div>
            ) : null}
            <div className={skin.field}>
              <label className={skin.label} htmlFor={id("customerLocale")}>
                {t.fields.customerLocale}
              </label>
              <select
                className={skin.select}
                id={id("customerLocale")}
                name="customerLocale"
                defaultValue={customerLocale ?? "en"}
                aria-describedby={hintId("customerLocale")}
              >
                <option value="en">{t.languages.en}</option>
                <option value="es">{t.languages.es}</option>
              </select>
              <p className={skin.hint} id={hintId("customerLocale")}>
                {t.hints.customerLocale}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className={skin.section}>
        <h3 className={skin.sectionTitle}>{t.sections.event}</h3>
        <div className={skin.grid}>
          <div className={skin.field}>
            <label className={skin.label} htmlFor={id("eventDate")}>
              {t.fields.eventDate}
            </label>
            <input
              className={skin.input}
              id={id("eventDate")}
              name="eventDate"
              type="date"
              required
              defaultValue={values.eventDate}
              aria-invalid={invalid("eventDate")}
              aria-describedby={ids(mode === "team-edit" && hintId("eventDate"), errors.eventDate && errorId("eventDate"))}
            />
            {mode === "team-edit" ? (
              <p className={skin.hint} id={hintId("eventDate")}>
                {t.team.dateHintEdit}
              </p>
            ) : null}
            {error("eventDate")}
          </div>
          <div className={skin.field}>
            <label className={skin.label} htmlFor={id("eventTime")}>
              {label("eventTime")}
              {optional}
            </label>
            <input
              className={skin.input}
              id={id("eventTime")}
              name="eventTime"
              type="time"
              defaultValue={values.eventTime}
              aria-invalid={invalid("eventTime")}
              aria-describedby={ids(hintId("eventTime"), errors.eventTime && errorId("eventTime"))}
            />
            <p className={skin.hint} id={hintId("eventTime")}>
              {t.hints.eventTime}
            </p>
            {error("eventTime")}
          </div>
        </div>
        <div className={skin.grid}>
          <div className={skin.field}>
            <label className={skin.label} htmlFor={id("headcount")}>
              {t.fields.headcount}
            </label>
            <input
              className={skin.input}
              id={id("headcount")}
              name="headcount"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              required
              maxLength={6}
              defaultValue={values.headcount}
              aria-invalid={invalid("headcount")}
              aria-describedby={ids(errors.headcount && errorId("headcount"))}
            />
            {error("headcount")}
          </div>
          <div className={skin.field}>
            <label className={skin.label} htmlFor={id("budget")}>
              {t.fields.budget}
              {optional}
            </label>
            <input
              className={skin.input}
              id={id("budget")}
              name="budget"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              maxLength={16}
              defaultValue={values.budget}
              aria-invalid={invalid("budget")}
              aria-describedby={ids(hintId("budget"), errors.budget && errorId("budget"))}
            />
            <p className={skin.hint} id={hintId("budget")}>
              {t.hints.budget}
            </p>
            {error("budget")}
          </div>
        </div>
        <div className={skin.field}>
          <label className={skin.label} htmlFor={id("occasion")}>
            {t.fields.occasion}
            {optional}
          </label>
          <input
            className={skin.input}
            id={id("occasion")}
            name="occasion"
            type="text"
            autoComplete="off"
            maxLength={120}
            defaultValue={values.occasion}
            aria-invalid={invalid("occasion")}
            aria-describedby={ids(hintId("occasion"), errors.occasion && errorId("occasion"))}
          />
          <p className={skin.hint} id={hintId("occasion")}>
            {t.hints.occasion}
          </p>
          {error("occasion")}
        </div>
      </div>

      <div className={skin.section}>
        <h3 className={skin.sectionTitle}>{t.sections.handoff}</h3>
        <fieldset
          className={skin.fieldset}
          id={id("fulfillment")}
          aria-describedby={ids(errors.fulfillment && errorId("fulfillment"))}
        >
          <legend className={skin.legend}>{label("fulfillment")}</legend>
          <div className={skin.choices}>
            {(["pickup", "delivery", "undecided"] as const).map((option) => (
              <label key={option} className={skin.choice}>
                <input type="radio" name="fulfillment" value={option} defaultChecked={values.fulfillment === option} />
                <span>{t.fulfillment[option]}</span>
              </label>
            ))}
          </div>
          {error("fulfillment")}
        </fieldset>
        <div className={skin.field}>
          <label className={skin.label} htmlFor={id("address")}>
            {t.fields.address}
          </label>
          <textarea
            className={skin.textarea}
            id={id("address")}
            name="address"
            rows={2}
            autoComplete={auto("street-address")}
            maxLength={300}
            defaultValue={values.address}
            aria-invalid={invalid("address")}
            aria-describedby={ids(hintId("address"), errors.address && errorId("address"))}
          />
          <p className={skin.hint} id={hintId("address")}>
            {t.hints.address}
          </p>
          {error("address")}
        </div>
      </div>

      <div className={skin.section}>
        <h3 className={skin.sectionTitle}>{isPublic ? t.sections.you : t.team.sectionCustomer}</h3>
        <div className={skin.grid}>
          <div className={skin.field}>
            <label className={skin.label} htmlFor={id("name")}>
              {label("name")}
            </label>
            <input
              className={skin.input}
              id={id("name")}
              name="name"
              type="text"
              autoComplete={auto("name")}
              required
              maxLength={120}
              defaultValue={values.name}
              aria-invalid={invalid("name")}
              aria-describedby={ids(errors.name && errorId("name"))}
            />
            {error("name")}
          </div>
          <div className={skin.field}>
            <label className={skin.label} htmlFor={id("company")}>
              {t.fields.company}
              {optional}
            </label>
            <input
              className={skin.input}
              id={id("company")}
              name="company"
              type="text"
              autoComplete={auto("organization")}
              maxLength={120}
              defaultValue={values.company}
              aria-invalid={invalid("company")}
              aria-describedby={ids(errors.company && errorId("company"))}
            />
            {error("company")}
          </div>
        </div>
        <div className={skin.grid}>
          <div className={skin.field}>
            <label className={skin.label} htmlFor={id("email")}>
              {t.fields.email}
            </label>
            <input
              className={skin.input}
              id={id("email")}
              name="email"
              type="email"
              inputMode="email"
              autoComplete={auto("email")}
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              defaultValue={values.email}
              aria-invalid={invalid("email")}
              aria-describedby={ids(hintId("contact"), errors.email && errorId("email"))}
            />
            {error("email")}
          </div>
          <div className={skin.field}>
            <label className={skin.label} htmlFor={id("phone")}>
              {t.fields.phone}
            </label>
            <input
              className={skin.input}
              id={id("phone")}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete={auto("tel")}
              maxLength={40}
              defaultValue={values.phone}
              aria-invalid={invalid("phone")}
              aria-describedby={ids(hintId("contact"), errors.phone && errorId("phone"))}
            />
            {error("phone")}
          </div>
        </div>
        <p className={skin.hint} id={hintId("contact")}>
          {isPublic ? t.hints.contact : t.team.contactHint}
        </p>
        <fieldset
          className={skin.fieldset}
          id={id("preferredContact")}
          aria-describedby={ids(errors.preferredContact && errorId("preferredContact"))}
        >
          <legend className={skin.legend}>{label("preferredContact")}</legend>
          <div className={skin.choices}>
            {(["email", "phone"] as const).map((option) => (
              <label key={option} className={skin.choice}>
                <input type="radio" name="preferredContact" value={option} defaultChecked={values.preferredContact === option} />
                <span>{t.preferred[option]}</span>
              </label>
            ))}
          </div>
          {error("preferredContact")}
        </fieldset>
      </div>

      <div className={skin.section}>
        <h3 className={skin.sectionTitle}>{t.sections.food}</h3>
        <div className={skin.field}>
          <label className={skin.label} htmlFor={id("dietary")}>
            {t.fields.dietary}
            {optional}
          </label>
          <textarea
            className={skin.textarea}
            id={id("dietary")}
            name="dietary"
            rows={3}
            maxLength={1000}
            defaultValue={values.dietary}
            aria-invalid={invalid("dietary")}
            aria-describedby={ids(isPublic && hintId("dietary"), errors.dietary && errorId("dietary"))}
          />
          {isPublic ? (
            <p className={skin.hint} id={hintId("dietary")}>
              {t.hints.dietary}
            </p>
          ) : null}
          {error("dietary")}
        </div>
        <div className={skin.field}>
          <label className={skin.label} htmlFor={id("message")}>
            {label("message")}
            {optional}
          </label>
          <textarea
            className={skin.textarea}
            id={id("message")}
            name="message"
            rows={4}
            maxLength={2000}
            defaultValue={values.message}
            aria-invalid={invalid("message")}
            aria-describedby={ids(isPublic && hintId("message"), errors.message && errorId("message"))}
          />
          {isPublic ? (
            <p className={skin.hint} id={hintId("message")}>
              {t.hints.message}
            </p>
          ) : null}
          {error("message")}
        </div>
      </div>
    </>
  );
}

/** Fields in the order they appear, for the error summary at the top of the form. */
export const INQUIRY_FIELD_ORDER: ReadonlyArray<keyof InquiryFormValues> = [
  "source",
  "eventDate",
  "eventTime",
  "headcount",
  "budget",
  "occasion",
  "fulfillment",
  "address",
  "name",
  "company",
  "email",
  "phone",
  "preferredContact",
  "dietary",
  "message",
  "consentContact",
];
