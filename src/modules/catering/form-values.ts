/**
 * The raw shape of the catering forms, exactly as typed. No imports on purpose: the forms run
 * in the browser and share these with the server-side rules in schema.ts.
 */

/** The request form. Used to re-fill the form when something needs fixing. */
export type InquiryFormValues = {
  name: string;
  email: string;
  phone: string;
  preferredContact: string;
  company: string;
  eventDate: string;
  eventTime: string;
  headcount: string;
  budget: string;
  fulfillment: string;
  address: string;
  occasion: string;
  dietary: string;
  message: string;
  source: string;
  consentContact: boolean;
  consentNews: boolean;
};

export const EMPTY_INQUIRY_VALUES: InquiryFormValues = {
  name: "",
  email: "",
  phone: "",
  preferredContact: "email",
  company: "",
  eventDate: "",
  eventTime: "",
  headcount: "",
  budget: "",
  fulfillment: "undecided",
  address: "",
  occasion: "",
  dietary: "",
  message: "",
  source: "phone",
  consentContact: false,
  consentNews: false,
};

/** How many line rows the quote form shows. It works without JavaScript, so the count is fixed. */
export const QUOTE_FORM_ROWS = 8;

export type QuoteRowValues = { description: string; quantity: string; price: string };
export type QuoteFormValues = { rows: QuoteRowValues[]; notes: string; validUntil: string };

export function emptyQuoteValues(): QuoteFormValues {
  return {
    rows: Array.from({ length: QUOTE_FORM_ROWS }, () => ({ description: "", quantity: "", price: "" })),
    notes: "",
    validUntil: "",
  };
}
