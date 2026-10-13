import type { QuoteFormValues } from "./form-values";
import type { QuoteFormErrors } from "./schema";

/** What the quote form shows after a submission. Returned by the server action. */
export type QuoteFormState = {
  /** Goes up with every response so the form re-fills with what was typed. */
  attempt: number;
  values: QuoteFormValues;
  errors: QuoteFormErrors;
  /** A short code when the quote could not be saved for a reason other than the typed values. */
  failure?: string;
};
