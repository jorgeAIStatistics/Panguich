import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getSessionUser, isDemoMode } from "@/lib/auth/session";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { demoSignIn, setOwnerLanguage } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

const copy = {
  en: {
    title: "Owner workspace",
    lead: "See what needs attention, look at the evidence, and decide.",
    demoTitle: "Demo sign-in",
    demoBody: "Choose a sample person to see what each role can do. There are no passwords because nothing here is connected to your live systems.",
    continueAs: "Continue as",
    offTitle: "Sign-in is not set up yet",
    offBody: "Demo sign-in is switched off for this build, and real accounts are added in the pilot phase.",
    can: {
      owner: "Sees everything and gives final approval.",
      manager: "Runs catering and drafts campaigns. Cannot approve spend or disputes.",
      staff: "Sees catering events to help fulfill them. No financial documents.",
    },
    backToSite: "Back to the website",
  },
  es: {
    title: "Espacio del dueño",
    lead: "Mira qué necesita atención, revisa la evidencia y decide.",
    demoTitle: "Ingreso de demostración",
    demoBody: "Elige una persona de muestra para ver qué puede hacer cada rol. No hay contraseñas porque nada aquí está conectado a tus sistemas reales.",
    continueAs: "Continuar como",
    offTitle: "El ingreso aún no está configurado",
    offBody: "El ingreso de demostración está apagado en esta versión, y las cuentas reales se agregan en la fase piloto.",
    can: {
      owner: "Ve todo y da la aprobación final.",
      manager: "Maneja el catering y prepara campañas. No aprueba gastos ni reclamos.",
      staff: "Ve los eventos de catering para ayudar a cumplirlos. Sin documentos financieros.",
    },
    backToSite: "Volver al sitio web",
  },
} as const;

export default async function SignInPage() {
  if (await getSessionUser()) redirect("/owner");
  const locale = await getOwnerLocale();
  const t = copy[locale];
  const shared = ownerDict(locale);
  const demo = isDemoMode();
  const people = demo ? await (await getDb()).select().from(users).orderBy(asc(users.createdAt), asc(users.id)) : [];
  const order = ["owner", "manager", "staff"];
  people.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));

  return (
    <div className="o-app">
      <div className="manta" aria-hidden="true" />
      <main className="o-main" style={{ paddingBottom: "var(--s-7)" }}>
        <form action={setOwnerLanguage} className="o-row" style={{ justifyContent: "flex-end", marginBottom: "var(--s-5)" }}>
          <span className="o-meta">{shared.language}</span>
          <button className="o-btn o-btn--sm" name="locale" value="en" aria-pressed={locale === "en"} lang="en">
            English
          </button>
          <button className="o-btn o-btn--sm" name="locale" value="es" aria-pressed={locale === "es"} lang="es">
            Español
          </button>
        </form>

        <header className="o-head">
          <p className="o-head__eyebrow">Panguich</p>
          <h1>{t.title}</h1>
          <p>{t.lead}</p>
        </header>

        {demo ? (
          <section className="o-stack" aria-labelledby="demo-title">
            <div className="o-notice o-notice--synthetic">
              <strong id="demo-title">{t.demoTitle}.</strong> {t.demoBody}
            </div>
            {people.map((person) => (
              <form key={person.id} action={demoSignIn} className="o-card o-stack o-stack--tight">
                <input type="hidden" name="userId" value={person.id} />
                <div className="o-row o-row--between">
                  <span className="o-card__title">{shared.roles[person.role]}</span>
                  <span className="o-badge o-badge--synthetic">{shared.sampleData}</span>
                </div>
                <p className="o-muted" style={{ fontSize: "var(--text-sm)" }}>
                  {t.can[person.role]}
                </p>
                <button className="o-btn o-btn--primary o-btn--block" type="submit">
                  {t.continueAs} {shared.roles[person.role]}
                </button>
              </form>
            ))}
          </section>
        ) : (
          <div className="o-empty">
            <strong>{t.offTitle}</strong>
            {t.offBody}
          </div>
        )}

        <p style={{ marginTop: "var(--s-5)" }}>
          <Link className="o-back" href={`/${locale}`}>
            ← {t.backToSite}
          </Link>
        </p>
      </main>
    </div>
  );
}
