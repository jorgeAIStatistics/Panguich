import type { Bilingual } from "@/lib/i18n";
import { daysBetweenIsoDates } from "@/lib/time";

/**
 * Honest connection states. Nothing is "connected" unless a real account connection has been
 * set up AND verified. A public link is not a connection.
 */
export type IntegrationState = "not_configured" | "mocked_demo" | "read_only" | "live_verified" | "stale" | "failed";

export const INTEGRATION_STATE_LABEL: Record<IntegrationState, Bilingual> = {
  not_configured: { en: "Not connected", es: "No conectado" },
  mocked_demo: { en: "Demo only (sample data)", es: "Solo demostración (datos de muestra)" },
  read_only: { en: "Connected, read-only", es: "Conectado, solo lectura" },
  live_verified: { en: "Connected and verified", es: "Conectado y verificado" },
  stale: { en: "Out of date, needs a re-check", es: "Desactualizado, hay que revisarlo" },
  failed: { en: "Connection failed", es: "Falló la conexión" },
};

export type Integration = {
  id: string;
  name: Bilingual;
  state: IntegrationState;
  /** What this would be used for, and what is needed to turn it on. */
  detail: Bilingual;
};

export const INTEGRATIONS: Integration[] = [
  {
    id: "toast-data",
    name: { en: "Toast sales and orders", es: "Ventas y pedidos de Toast" },
    state: "not_configured",
    detail: {
      en: "Needed to see real orders and sales. Toast's standard access is read-only and has no test environment; it requires the owner to request it from Toast. Until then this workspace shows no sales figures at all.",
      es: "Hace falta para ver pedidos y ventas reales. El acceso estándar de Toast es solo de lectura y no tiene ambiente de prueba; el dueño debe solicitarlo a Toast. Hasta entonces, este espacio no muestra ninguna cifra de ventas.",
    },
  },
  {
    id: "spothopper",
    name: { en: "SpotHopper (current website, email, social)", es: "SpotHopper (sitio actual, correo, redes)" },
    state: "not_configured",
    detail: {
      en: "Your current website and its catering form run on SpotHopper. Nothing here reads from or writes to it. Whether its data can be exported is a question for your SpotHopper contact.",
      es: "Tu sitio actual y su formulario de catering funcionan con SpotHopper. Aquí nada lee ni escribe en esa cuenta. Si sus datos se pueden exportar es una consulta para tu contacto en SpotHopper.",
    },
  },
  {
    id: "email",
    name: { en: "Email sending", es: "Envío de correos" },
    state: "not_configured",
    detail: {
      en: "No emails are sent from this workspace. Quotes and campaign text are copied and sent by you.",
      es: "Desde este espacio no se envía ningún correo. Las cotizaciones y los textos de campaña los copias y envías tú.",
    },
  },
  {
    id: "sms",
    name: { en: "Text messages", es: "Mensajes de texto" },
    state: "not_configured",
    detail: {
      en: "No text messages are sent. A texting program needs its own customer consent and a legal review first.",
      es: "No se envían mensajes de texto. Un programa de mensajes necesita primero el consentimiento propio de cada cliente y una revisión legal.",
    },
  },
  {
    id: "payments",
    name: { en: "Payments and deposits", es: "Pagos y adelantos" },
    state: "not_configured",
    detail: {
      en: "No payments are taken here and no card details are stored. Deposits are recorded by hand and marked as not verified.",
      es: "Aquí no se cobra nada ni se guardan datos de tarjetas. Los adelantos se anotan a mano y se marcan como no verificados.",
    },
  },
  {
    id: "social",
    name: { en: "Instagram and Facebook publishing", es: "Publicación en Instagram y Facebook" },
    state: "not_configured",
    detail: {
      en: "Nothing is posted from here. Approved campaign text is exported for you to post.",
      es: "Desde aquí no se publica nada. El texto aprobado de una campaña se exporta para que lo publiques tú.",
    },
  },
  {
    id: "ai",
    name: { en: "AI drafting", es: "Redacción con IA" },
    state: "not_configured",
    detail: {
      en: "No AI service is used in this demonstration. Drafts come from fixed templates, and every number is calculated by ordinary code you can trace.",
      es: "En esta demostración no se usa ningún servicio de IA. Los borradores salen de plantillas fijas y cada número lo calcula código común que se puede rastrear.",
    },
  },
];

export const LINK_STALE_AFTER_DAYS = 30;

/** A public fact we read on a given date goes stale after a month and should be re-checked. */
export function checkFreshness(checkedOn: string, today: string): { stale: boolean; ageDays: number } {
  const ageDays = daysBetweenIsoDates(checkedOn, today);
  return { stale: ageDays > LINK_STALE_AFTER_DAYS, ageDays };
}
