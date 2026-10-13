import type { Permission, Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";

/** Shared owner-workspace words. Each module keeps its own dictionary next to its code. */
const dict = {
  en: {
    workspace: "Owner workspace",
    demoBanner: "Demo environment · sample sign-in · nothing here sends messages, takes payments, or changes your live systems.",
    nav: { today: "Today", grow: "Grow", catering: "Catering", operations: "Operations", settings: "Settings" },
    signOut: "Sign out",
    viewSite: "View website",
    language: "Language",
    sampleData: "Sample data",
    sampleDataHint: "Invented for this demonstration. Not your real records.",
    observed: "Observed",
    estimate: "Estimate",
    source: "Source",
    freshness: "As of",
    notKnown: "What we don't know",
    back: "Back",
    save: "Save",
    cancel: "Cancel",
    notAllowedTitle: "Not available for your role",
    notAllowedBody: "This area is limited to certain roles. Ask the owner if you need access.",
    roles: { owner: "Owner", manager: "Manager", staff: "Staff" } satisfies Record<Role, string>,
  },
  es: {
    workspace: "Espacio del dueño",
    demoBanner: "Entorno de demostración · ingreso de muestra · aquí nada envía mensajes, cobra pagos ni cambia tus sistemas reales.",
    nav: { today: "Hoy", grow: "Crecer", catering: "Catering", operations: "Operaciones", settings: "Ajustes" },
    signOut: "Salir",
    viewSite: "Ver sitio web",
    language: "Idioma",
    sampleData: "Datos de muestra",
    sampleDataHint: "Inventados para esta demostración. No son tus registros reales.",
    observed: "Observado",
    estimate: "Estimación",
    source: "Fuente",
    freshness: "Al",
    notKnown: "Lo que no sabemos",
    back: "Volver",
    save: "Guardar",
    cancel: "Cancelar",
    notAllowedTitle: "No disponible para tu rol",
    notAllowedBody: "Esta sección está limitada a ciertos roles. Pide acceso al dueño si lo necesitas.",
    roles: { owner: "Dueño", manager: "Gerente", staff: "Equipo" } satisfies Record<Role, string>,
  },
} as const;

export type OwnerDict = (typeof dict)[Locale];

export function ownerDict(locale: Locale): OwnerDict {
  return dict[locale];
}

export type NavKey = keyof OwnerDict["nav"];

/** Sections shown in the workspace navigation, with the permission needed to see each. */
export const NAV_ITEMS: ReadonlyArray<{ key: NavKey; href: string; permission: Permission }> = [
  { key: "today", href: "/owner", permission: "today.view" },
  { key: "grow", href: "/owner/grow", permission: "growth.view" },
  { key: "catering", href: "/owner/catering", permission: "catering.view" },
  { key: "operations", href: "/owner/operations", permission: "operations.view" },
  { key: "settings", href: "/owner/settings", permission: "settings.view" },
];
