import type { Bilingual } from "@/lib/i18n";

/**
 * The exact words a website visitor sees next to each consent checkbox.
 *
 * These are stored with every consent record as evidence, together with the version below.
 * Change the wording -> change the version, so an old record always points at the words the
 * person actually agreed to. This file has no database imports so the form can show the same
 * text the server stores.
 */
export const CONSENT_DISCLOSURE_VERSION = "catering-form-2026-10-v1";

export type FormConsentChannel = "transactional_contact" | "email_marketing";

export const CONSENT_DISCLOSURES: Record<FormConsentChannel, Bilingual> = {
  transactional_contact: {
    en: "I agree that Panguich may contact me by email or phone about this catering request.",
    es: "Acepto que Panguich me contacte por correo o teléfono sobre esta solicitud de catering.",
  },
  email_marketing: {
    en: "Also send me occasional email news and offers from Panguich. Optional. I can unsubscribe at any time.",
    es: "También envíenme de vez en cuando novedades y ofertas de Panguich por correo. Es opcional y puedo darme de baja cuando quiera.",
  },
};

/** Wording stored when a person asks to stop receiving messages. */
export const UNSUBSCRIBE_DISCLOSURE: Bilingual = {
  en: "The person asked not to receive these messages (unsubscribe / STOP).",
  es: "La persona pidió no recibir estos mensajes (darse de baja / STOP).",
};
export const UNSUBSCRIBE_VERSION = "unsubscribe-v1";
