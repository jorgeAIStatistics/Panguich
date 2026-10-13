import type { FulfillmentType, QuoteLine } from "@/db/schema";
import type { Locale } from "@/lib/i18n";
import { formatUsd, multiplyCents, sumCents, type Cents } from "@/lib/money";
import { formatClockTime, formatIsoDate } from "@/lib/time";

/** Quote arithmetic and the plain-text message the owner copies to the customer. Pure. */

export function lineTotalCents(line: QuoteLine): Cents {
  return multiplyCents(line.unitPriceCents, line.quantity);
}

/** Subtotal in integer cents. Always calculated on the server from the lines; never typed in. */
export function quoteSubtotalCents(lines: readonly QuoteLine[]): Cents {
  return sumCents(lines.map(lineTotalCents));
}

const copy = {
  en: {
    greeting: (name: string) => `Hi ${name},`,
    thanks: (reference: string, restaurant: string) => `Thank you for your catering request with ${restaurant} (reference ${reference}).`,
    event: "Event",
    guests: (n: number) => (n === 1 ? "1 guest" : `${n} guests`),
    fulfillment: { pickup: "Pickup at the restaurant", delivery: "Delivery", undecided: "Pickup or delivery to be decided" },
    deliveryTo: (address: string) => `Delivery to ${address}`,
    estimate: (version: number) => `Estimate (version ${version})`,
    each: "each",
    subtotal: "Subtotal before tax and fees",
    notes: "Notes",
    validUntil: (date: string) => `This estimate is valid until ${date}.`,
    disclaimer: "This is an estimate, not a confirmed booking. Tax and any fees are not included.",
    next: (phone: string) => `To go ahead or change anything, reply to this message or call us at ${phone}. We will confirm the details with you before anything is booked.`,
  },
  es: {
    greeting: (name: string) => `Hola ${name}:`,
    thanks: (reference: string, restaurant: string) => `Gracias por tu solicitud de catering con ${restaurant} (referencia ${reference}).`,
    event: "Evento",
    guests: (n: number) => (n === 1 ? "1 persona" : `${n} personas`),
    fulfillment: { pickup: "Para recoger en el restaurante", delivery: "Entrega", undecided: "Recojo o entrega por definir" },
    deliveryTo: (address: string) => `Entrega en ${address}`,
    estimate: (version: number) => `Cotización (versión ${version})`,
    each: "c/u",
    subtotal: "Subtotal antes de impuestos y cargos",
    notes: "Notas",
    validUntil: (date: string) => `Esta cotización es válida hasta el ${date}.`,
    disclaimer: "Esto es una cotización, no una reserva confirmada. No incluye impuestos ni cargos.",
    next: (phone: string) => `Para seguir adelante o cambiar algo, responde a este mensaje o llámanos al ${phone}. Confirmaremos los detalles contigo antes de reservar nada.`,
  },
} as const;

export type QuoteMessageInput = {
  locale: Locale;
  restaurantName: string;
  restaurantPhone: string;
  restaurantAddress: string;
  reference: string;
  contactName: string;
  eventDate: string;
  eventTime: string | null;
  headcount: number;
  fulfillment: FulfillmentType;
  eventAddress: string | null;
  version: number;
  lines: readonly QuoteLine[];
  notes: string | null;
  validUntil: string | null;
};

/**
 * The quote as plain text, in the customer's language, for the owner to copy and send by hand.
 * Nothing in this system sends it.
 */
export function buildQuoteMessage(input: QuoteMessageInput): string {
  const t = copy[input.locale];
  const when = [formatIsoDate(input.eventDate, input.locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })];
  if (input.eventTime) when.push(formatClockTime(input.eventTime, input.locale));
  const where =
    input.fulfillment === "delivery" && input.eventAddress ? t.deliveryTo(input.eventAddress) : t.fulfillment[input.fulfillment];

  const lines = input.lines.map(
    (line) =>
      `- ${line.quantity} × ${line.description}: ${formatUsd(line.unitPriceCents, input.locale)} ${t.each} = ${formatUsd(lineTotalCents(line), input.locale)}`,
  );

  const parts: string[] = [
    t.greeting(input.contactName),
    "",
    t.thanks(input.reference, input.restaurantName),
    "",
    `${t.event}: ${when.join(", ")} · ${t.guests(input.headcount)} · ${where}`,
    "",
    `${t.estimate(input.version)}:`,
    ...lines,
    `${t.subtotal}: ${formatUsd(quoteSubtotalCents(input.lines), input.locale)}`,
  ];
  if (input.notes) parts.push("", `${t.notes}: ${input.notes}`);
  if (input.validUntil) {
    parts.push("", t.validUntil(formatIsoDate(input.validUntil, input.locale, { month: "long", day: "numeric", year: "numeric" })));
  }
  parts.push("", t.disclaimer, t.next(input.restaurantPhone), "", `${input.restaurantName} · ${input.restaurantAddress}`);
  return parts.join("\n");
}
