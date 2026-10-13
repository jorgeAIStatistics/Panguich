import type { Locale } from "@/lib/i18n";
import type { InquiryFormValues } from "./form-values";
import type { InquiryErrorCode } from "./schema";

/**
 * Words for the catering request form (the public website form and the team's "add a request"
 * form). Kept apart from i18n.ts, and free of database imports, because these forms run in
 * the browser.
 */

export type InquiryFormFailure = "rate_limited" | "blocked" | "server" | "not_allowed" | "locked";

/** What the form shows after a submission. Returned by the server action. */
export type InquiryFormState = {
  status: "idle" | "invalid" | "failed" | "success";
  /** Goes up with every response so the form re-fills with what was typed. */
  attempt: number;
  values: InquiryFormValues;
  errors: Partial<Record<keyof InquiryFormValues, InquiryErrorCode>>;
  failure?: InquiryFormFailure;
  reference?: string;
  /** True when the request was saved in the demonstration workspace only. */
  demo?: boolean;
  /** Team form only: the customer's language as chosen in the form, kept across a failed save. */
  customerLocale?: Locale;
};

const copy = {
  en: {
    sections: {
      event: "About the event",
      handoff: "Pickup or delivery",
      you: "About you",
      food: "Anything we should know",
    },
    fields: {
      eventDate: "Event date",
      eventTime: "Time",
      headcount: "Number of guests",
      budget: "Budget in dollars",
      occasion: "Occasion",
      fulfillment: "How would you like to get your order?",
      address: "Event address",
      name: "Your name",
      company: "Company or group",
      email: "Email",
      phone: "Phone",
      preferredContact: "Best way to reach you",
      dietary: "Allergies or dietary needs",
      message: "Message",
      source: "How did this request arrive?",
      customerLocale: "Customer's language",
    },
    optional: "optional",
    hints: {
      eventTime: "When the food is needed. A best guess is fine.",
      budget: "A rough total for the whole event.",
      occasion: "Birthday, office lunch, family gathering…",
      address: "Needed for delivery. Street, city and ZIP code.",
      addressPickup: "Only needed for delivery.",
      contact: "Give us at least the one you prefer.",
      dietary: "Tell us what to ask about. We will go over it with you before anything is confirmed.",
      message: "Dishes you have in mind, how you would like it served, or any question.",
      customerLocale: "The quote message is written in this language.",
    },
    fulfillment: { pickup: "Pickup at the restaurant", delivery: "Delivery", undecided: "Not sure yet" },
    preferred: { email: "Email", phone: "Phone" },
    sources: { phone: "Phone call", walk_in: "In person at the restaurant", email: "Email", referral: "Referral" },
    languages: { en: "English", es: "Spanish" },
    consentLegend: "Your permission",
    required: "required",
    submit: "Send request",
    sending: "Sending…",
    errorSummary: (n: number) => (n === 1 ? "Please check 1 field" : `Please check ${n} fields`),
    errors: {
      name_required: "Enter your name.",
      email_required: "Enter an email address, or choose phone as the best way to reach you.",
      email_invalid: "This email address does not look right. Example: name@example.com",
      phone_required: "Enter a phone number, or choose email as the best way to reach you.",
      phone_invalid: "Enter a phone number with area code, for example (954) 555-0100.",
      preferred_invalid: "Choose email or phone.",
      date_invalid: "Choose the date of the event.",
      date_past: "This date has already passed. Choose today or a later date.",
      date_too_far: "Choose a date within the next 18 months.",
      time_invalid: "Enter a time such as 12:30 PM, or leave it empty.",
      headcount_invalid: "Enter the number of guests as a whole number, for example 25.",
      headcount_range: "Enter a number of guests between 1 and 2,000.",
      budget_invalid: "Enter an amount such as 500 or 1,250.00, or leave it empty.",
      budget_too_large: "Enter an amount up to $1,000,000, or leave it empty.",
      fulfillment_invalid: "Choose pickup, delivery, or not sure yet.",
      address_required: "Enter the delivery address, or choose pickup or not sure yet.",
      source_invalid: "Choose how the request arrived.",
      consent_required: "Tick this box so Panguich can reply to you. Without it we cannot take the request.",
      too_long: "This is too long. Please shorten it.",
    } satisfies Record<InquiryErrorCode, string>,
    failures: {
      rate_limited: (phone: string) => `We have received several requests from this connection in a short time. Please wait a few minutes and try again, or call us at ${phone}.`,
      blocked: (phone: string) => `We could not take this request online. Please call us at ${phone}.`,
      server: (phone: string) => `Something went wrong on our side and your request was not saved. Please try again, or call us at ${phone}.`,
      not_allowed: () => "Your role cannot add or change catering requests.",
      locked: () => "This request can no longer be edited.",
    } satisfies Record<InquiryFormFailure, (phone: string) => string>,
    honeypot: "Leave this field empty",
    success: {
      title: "Request received",
      reference: "Your reference",
      notBooking: "This is a request, not a confirmed booking. Panguich will contact you to confirm details and pricing.",
      change: (phone: string) => `Need to change something? Call ${phone} and mention your reference.`,
      demo: "Demonstration: this request is saved in the demo workspace only. It is not sent to the restaurant.",
      again: "Send another request",
    },
    team: {
      create: "Save request",
      update: "Save changes",
      noConsent:
        "A request you type in records no permission for marketing. Reply to the customer about this request only; do not add them to any mailing list.",
      contactHint: "Enter at least the contact the customer prefers.",
      dateHintEdit: "The current date can stay even if it has passed.",
      sectionCustomer: "Customer",
      fields: {
        name: "Customer's name",
        preferredContact: "Best way to reach them",
        fulfillment: "Pickup or delivery?",
        message: "What the customer asked for",
      },
      errors: {
        name_required: "Enter the customer's name.",
        email_required: "Enter an email, or choose phone as the best way to reach them.",
        phone_required: "Enter a phone number, or choose email as the best way to reach them.",
      },
    },
  },
  es: {
    sections: {
      event: "Sobre el evento",
      handoff: "Recojo o entrega",
      you: "Sobre ti",
      food: "Algo que debamos saber",
    },
    fields: {
      eventDate: "Fecha del evento",
      eventTime: "Hora",
      headcount: "Número de personas",
      budget: "Presupuesto en dólares",
      occasion: "Ocasión",
      fulfillment: "¿Cómo prefieres recibir tu pedido?",
      address: "Dirección del evento",
      name: "Tu nombre",
      company: "Empresa o grupo",
      email: "Correo electrónico",
      phone: "Teléfono",
      preferredContact: "Mejor forma de contactarte",
      dietary: "Alergias o necesidades de alimentación",
      message: "Mensaje",
      source: "¿Cómo llegó esta solicitud?",
      customerLocale: "Idioma del cliente",
    },
    optional: "opcional",
    hints: {
      eventTime: "A qué hora se necesita la comida. Un aproximado está bien.",
      budget: "Un total aproximado para todo el evento.",
      occasion: "Cumpleaños, almuerzo de oficina, reunión familiar…",
      address: "Necesaria para la entrega. Calle, ciudad y código postal.",
      addressPickup: "Solo se necesita para entrega.",
      contact: "Danos al menos el que prefieras.",
      dietary: "Cuéntanos qué debemos preguntar. Lo revisaremos contigo antes de confirmar nada.",
      message: "Platos que tienes en mente, cómo te gustaría servirlo o cualquier pregunta.",
      customerLocale: "El mensaje de la cotización se escribe en este idioma.",
    },
    fulfillment: { pickup: "Recoger en el restaurante", delivery: "Entrega", undecided: "Todavía no sé" },
    preferred: { email: "Correo", phone: "Teléfono" },
    sources: { phone: "Llamada telefónica", walk_in: "En persona en el restaurante", email: "Correo", referral: "Recomendación" },
    languages: { en: "Inglés", es: "Español" },
    consentLegend: "Tu permiso",
    required: "obligatorio",
    submit: "Enviar solicitud",
    sending: "Enviando…",
    errorSummary: (n: number) => (n === 1 ? "Revisa 1 campo" : `Revisa ${n} campos`),
    errors: {
      name_required: "Escribe tu nombre.",
      email_required: "Escribe un correo, o elige teléfono como mejor forma de contactarte.",
      email_invalid: "Este correo no parece correcto. Ejemplo: nombre@example.com",
      phone_required: "Escribe un teléfono, o elige correo como mejor forma de contactarte.",
      phone_invalid: "Escribe un teléfono con código de área, por ejemplo (954) 555-0100.",
      preferred_invalid: "Elige correo o teléfono.",
      date_invalid: "Elige la fecha del evento.",
      date_past: "Esa fecha ya pasó. Elige hoy o una fecha posterior.",
      date_too_far: "Elige una fecha dentro de los próximos 18 meses.",
      time_invalid: "Escribe una hora como 12:30 PM, o déjala vacía.",
      headcount_invalid: "Escribe el número de personas como número entero, por ejemplo 25.",
      headcount_range: "Escribe un número de personas entre 1 y 2,000.",
      budget_invalid: "Escribe un monto como 500 o 1,250.00, o déjalo vacío.",
      budget_too_large: "Escribe un monto de hasta $1,000,000, o déjalo vacío.",
      fulfillment_invalid: "Elige recojo, entrega o todavía no sé.",
      address_required: "Escribe la dirección de entrega, o elige recojo o todavía no sé.",
      source_invalid: "Elige cómo llegó la solicitud.",
      consent_required: "Marca esta casilla para que Panguich pueda responderte. Sin ella no podemos tomar la solicitud.",
      too_long: "Es demasiado largo. Acórtalo, por favor.",
    } satisfies Record<InquiryErrorCode, string>,
    failures: {
      rate_limited: (phone: string) => `Recibimos varias solicitudes desde esta conexión en poco tiempo. Espera unos minutos e inténtalo de nuevo, o llámanos al ${phone}.`,
      blocked: (phone: string) => `No pudimos tomar esta solicitud en línea. Llámanos al ${phone}.`,
      server: (phone: string) => `Algo falló de nuestro lado y tu solicitud no se guardó. Inténtalo de nuevo o llámanos al ${phone}.`,
      not_allowed: () => "Tu rol no puede agregar ni cambiar solicitudes de catering.",
      locked: () => "Esta solicitud ya no se puede editar.",
    } satisfies Record<InquiryFormFailure, (phone: string) => string>,
    honeypot: "Deja este campo vacío",
    success: {
      title: "Recibimos tu solicitud",
      reference: "Tu referencia",
      notBooking: "Esto es una solicitud, no una reserva confirmada. Panguich se comunicará contigo para confirmar los detalles y el precio.",
      change: (phone: string) => `¿Necesitas cambiar algo? Llama al ${phone} y menciona tu referencia.`,
      demo: "Demostración: esta solicitud se guarda solo en el espacio de demostración. No se envía al restaurante.",
      again: "Enviar otra solicitud",
    },
    team: {
      create: "Guardar solicitud",
      update: "Guardar cambios",
      noConsent:
        "Una solicitud que tú escribes no registra ningún permiso para publicidad. Respóndele al cliente solo sobre esta solicitud; no lo agregues a ninguna lista de correos.",
      contactHint: "Escribe al menos el contacto que el cliente prefiere.",
      dateHintEdit: "La fecha actual puede quedarse aunque ya haya pasado.",
      sectionCustomer: "Cliente",
      fields: {
        name: "Nombre del cliente",
        preferredContact: "Mejor forma de contactarlo",
        fulfillment: "¿Recojo o entrega?",
        message: "Lo que pidió el cliente",
      },
      errors: {
        name_required: "Escribe el nombre del cliente.",
        email_required: "Escribe un correo, o elige teléfono como mejor forma de contactarlo.",
        phone_required: "Escribe un teléfono, o elige correo como mejor forma de contactarlo.",
      },
    },
  },
} as const;

export type InquiryFormCopy = (typeof copy)[Locale];

export function inquiryFormCopy(locale: Locale): InquiryFormCopy {
  return copy[locale];
}
