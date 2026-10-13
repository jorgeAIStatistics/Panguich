import type { ChecklistKind, FulfillmentType, QuoteLine } from "@/db/schema";
import type { Bilingual, Locale } from "@/lib/i18n";

/**
 * The fulfillment pack: checklists and a purchasing draft built from the accepted quote.
 *
 * Fully deterministic (no AI): the same request and quote always give the same lists.
 * Nothing here invents quantities, recipes, portions or delivery slots.
 *
 * How labels are stored: a production item keeps the quote line exactly as written
 * ("40 × Sandwich tray"). A standard item keeps a key that starts with "@" (for example
 * "@packing.sauces") and is shown in the reader's language by `checklistLabel`.
 */

const STANDARD_ITEMS = {
  "@production.dietary": {
    en: "Read the customer's dietary notes with the kitchen before starting",
    es: "Leer con la cocina las notas de alimentación del cliente antes de empezar",
  },
  "@production.review": {
    en: "Review with the owner what will be prepared (the quote has no lines)",
    es: "Revisar con el dueño qué se va a preparar (la cotización no tiene líneas)",
  },
  "@packing.count": {
    en: "Count every tray and box against the quote before closing them",
    es: "Contar cada bandeja y caja contra la cotización antes de cerrarlas",
  },
  "@packing.sauces": {
    en: "Sauces packed, lids tight",
    es: "Salsas y cremas empacadas, con tapa bien cerrada",
  },
  "@packing.sides": {
    en: "Sides packed",
    es: "Acompañamientos empacados",
  },
  "@packing.utensils": {
    en: "Serving utensils included, if the customer asked for them",
    es: "Utensilios para servir incluidos, si el cliente los pidió",
  },
  "@packing.labels": {
    en: "Every tray and container labeled with what is inside",
    es: "Cada bandeja y envase con etiqueta de lo que lleva",
  },
  "@packing.napkins": {
    en: "Napkins, plates and cutlery included, if the customer asked for them",
    es: "Servilletas, platos y cubiertos incluidos, si el cliente los pidió",
  },
  "@packing.dietary": {
    en: "Items for dietary needs packed apart and clearly labeled",
    es: "Lo preparado por necesidades de alimentación va aparte y bien etiquetado",
  },
  "@handoff.contact": {
    en: "Customer reached on their phone or email and expecting the order",
    es: "Cliente contactado por teléfono o correo y esperando el pedido",
  },
  "@handoff.pickup_time": {
    en: "Pickup time confirmed with the customer",
    es: "Hora de recojo confirmada con el cliente",
  },
  "@handoff.pickup_plan": {
    en: "Pickup plan set: who hands the order over and where it waits",
    es: "Plan de recojo listo: quién entrega el pedido y dónde espera",
  },
  "@handoff.delivery_address_time": {
    en: "Delivery address and arrival time confirmed with the customer",
    es: "Dirección de entrega y hora de llegada confirmadas con el cliente",
  },
  "@handoff.delivery_plan": {
    en: "Delivery plan set: who takes it and when they leave",
    es: "Plan de entrega listo: quién lo lleva y a qué hora sale",
  },
  "@handoff.decide_fulfillment": {
    en: "Pickup or delivery decided with the customer",
    es: "Recojo o entrega definido con el cliente",
  },
  "@handoff.time_place": {
    en: "Time and place confirmed with the customer",
    es: "Hora y lugar confirmados con el cliente",
  },
  "@handoff.reference": {
    en: "At handoff: name and reference checked with the person receiving it",
    es: "Al entregar: nombre y referencia verificados con quien recibe",
  },
} as const satisfies Record<string, Bilingual>;

type StandardKey = keyof typeof STANDARD_ITEMS;

/** The words for a stored checklist label, in the reader's language. */
export function checklistLabel(label: string, locale: Locale): string {
  if (label.startsWith("@") && label in STANDARD_ITEMS) return STANDARD_ITEMS[label as StandardKey][locale];
  return label;
}

export type ChecklistPlanItem = { kind: ChecklistKind; label: string; sortOrder: number };

export type PackFacts = {
  fulfillment: FulfillmentType;
  dietaryNotes: string | null;
  lines: readonly QuoteLine[];
};

export function productionLabel(line: QuoteLine): string {
  return `${line.quantity} × ${line.description}`;
}

/** The three checklists for an event: production (one item per quote line), packing, handoff. */
export function planChecklist(facts: PackFacts): ChecklistPlanItem[] {
  const hasDietary = Boolean(facts.dietaryNotes?.trim());

  const production: string[] = [];
  if (hasDietary) production.push("@production.dietary" satisfies StandardKey);
  if (facts.lines.length === 0) production.push("@production.review" satisfies StandardKey);
  for (const line of facts.lines) production.push(productionLabel(line));

  const packing: StandardKey[] = ["@packing.count", "@packing.sauces", "@packing.sides", "@packing.utensils", "@packing.labels", "@packing.napkins"];
  if (hasDietary) packing.push("@packing.dietary");

  const handoff: StandardKey[] = ["@handoff.contact"];
  if (facts.fulfillment === "pickup") handoff.push("@handoff.pickup_time", "@handoff.pickup_plan");
  else if (facts.fulfillment === "delivery") handoff.push("@handoff.delivery_address_time", "@handoff.delivery_plan");
  else handoff.push("@handoff.decide_fulfillment", "@handoff.time_place");
  handoff.push("@handoff.reference");

  const withOrder = (kind: ChecklistKind, labels: readonly string[]) =>
    labels.map((label, index) => ({ kind, label, sortOrder: index }));
  return [...withOrder("production", production), ...withOrder("packing", packing), ...withOrder("handoff", handoff)];
}

export type ExistingChecklistItem = { kind: ChecklistKind; label: string; done: boolean; doneBy: string | null; doneAt: Date | null };
export type MergedChecklistItem = ChecklistPlanItem & { done: boolean; doneBy: string | null; doneAt: Date | null };

/**
 * When the quote or details change after the lists exist, the lists are rebuilt. A tick is kept
 * only if the very same item (same list, same words) is still there; a changed line starts unticked.
 */
export function mergeChecklist(existing: readonly ExistingChecklistItem[], plan: readonly ChecklistPlanItem[]): MergedChecklistItem[] {
  const remaining = existing.filter((item) => item.done);
  return plan.map((item) => {
    const index = remaining.findIndex((old) => old.kind === item.kind && old.label === item.label);
    if (index === -1) return { ...item, done: false, doneBy: null, doneAt: null };
    const [old] = remaining.splice(index, 1);
    return { ...item, done: true, doneBy: old.doneBy, doneAt: old.doneAt };
  });
}

/**
 * Purchasing draft: just the distinct things on the quote, in order. No quantities are
 * calculated, because recipes, portions and stock have not been set up.
 */
export function purchasingDraft(lines: readonly QuoteLine[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.description.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line.description.trim());
  }
  return out;
}

export type ChecklistProgress = { total: number; done: number; open: number };

export function checklistProgress(items: ReadonlyArray<{ done: boolean }>): ChecklistProgress {
  const done = items.filter((item) => item.done).length;
  return { total: items.length, done, open: items.length - done };
}
