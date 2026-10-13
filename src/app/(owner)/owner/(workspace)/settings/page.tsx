import type { Metadata } from "next";
import { count, desc, eq } from "drizzle-orm";
import { KNOWN_CONFLICTS, SOURCES } from "@/content/business";
import { checkFreshness, INTEGRATION_STATE_LABEL, INTEGRATIONS } from "@/content/integrations";
import { MENU_CHECKED_ON, MENU_ITEMS } from "@/content/menu";
import { getDb } from "@/db/client";
import { auditLog, cateringInquiries, users } from "@/db/schema";
import { can } from "@/lib/auth/permissions";
import { requirePagePermission } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { businessDateString, formatInstant, formatIsoDate } from "@/lib/time";
import { getConflictResolutions } from "@/modules/today/business";
import { setOwnerLanguage } from "../../actions";
import { answerConflict, resetDemo } from "./actions";

export const metadata: Metadata = { title: "Settings" };

const copy = {
  en: {
    lead: "Language, the facts we need you to confirm, and what is and is not connected.",
    language: "Language",
    languageHint: "Your choice is remembered for next time.",
    facts: "Facts to confirm",
    factsLead: "We read these from your own public pages. Where they disagree, we need your answer before anything goes live.",
    whatWeSaw: "What each page shows",
    checked: "checked",
    stale: "Over a month old. Re-check before relying on it.",
    yourAnswer: "Your answer",
    answerHint: "Saving records your decision. It does not change any website or ordering system.",
    saveAnswer: "Save my answer",
    answered: "Answered",
    ownerOnly: "Only the owner can answer this.",
    saved: "Saved.",
    emptyAnswer: "Write your answer first.",
    notAllowed: "Your role cannot do that.",
    connections: "Connections",
    connectionsLead: "Nothing is marked connected unless a real account link exists and has been tested.",
    handoff: "Order link (Toast)",
    handoffBody: "A plain public link to your Toast ordering page. It is not an account connection: this workspace cannot see orders.",
    content: "Website content",
    contentBody: (items: number, online: number, gloss: number) =>
      `${items} menu items read from your public pages (${online} listed for online ordering). ${gloss} short dish explanations were written by us as general descriptions and need your review.`,
    photos: "Photos and logo",
    photosBody: "0 approved photos. Every image space on the website is a labeled placeholder, and the logo is a text stand-in, until you approve real files.",
    demo: "Demo data",
    demoBody: (real: number) =>
      `This workspace holds labeled sample records plus ${real} request(s) entered during the demonstration. Resetting erases everything entered here and restores the samples.`,
    confirmReset: "I understand this erases everything entered in this demo.",
    reset: "Reset demo data",
    resetDone: "Demo data was reset.",
    resetConfirm: "Tick the box to confirm.",
    resetUnavailable: "Reset is only available in demo mode.",
    export: "Download a copy of everything",
    exportBody: "One file with all requests, quotes, campaigns, sample invoices and the activity log.",
    exportCta: "Download (JSON)",
    log: "Recent activity",
    logLead: "Who did what, and whether it was allowed.",
    logEmpty: "No activity yet.",
    visitor: "Website visitor",
    outcome: { ok: "Done", denied: "Refused", invalid: "Rejected", error: "Error" },
    people: "People and roles",
  },
  es: {
    lead: "Idioma, los datos que necesitamos que confirmes y qué está conectado y qué no.",
    language: "Idioma",
    languageHint: "Tu elección queda guardada para la próxima vez.",
    facts: "Datos por confirmar",
    factsLead: "Los leímos de tus propias páginas públicas. Donde no coinciden, necesitamos tu respuesta antes de publicar cualquier cosa.",
    whatWeSaw: "Lo que muestra cada página",
    checked: "revisado el",
    stale: "Tiene más de un mes. Vuelve a revisarlo antes de confiar en él.",
    yourAnswer: "Tu respuesta",
    answerHint: "Al guardar se registra tu decisión. No cambia ningún sitio web ni sistema de pedidos.",
    saveAnswer: "Guardar mi respuesta",
    answered: "Respondido",
    ownerOnly: "Solo el dueño puede responder esto.",
    saved: "Guardado.",
    emptyAnswer: "Primero escribe tu respuesta.",
    notAllowed: "Tu rol no puede hacer eso.",
    connections: "Conexiones",
    connectionsLead: "Nada figura como conectado si no existe un enlace real con la cuenta y fue probado.",
    handoff: "Enlace de pedidos (Toast)",
    handoffBody: "Un enlace público a tu página de pedidos en Toast. No es una conexión con la cuenta: este espacio no puede ver pedidos.",
    content: "Contenido del sitio web",
    contentBody: (items: number, online: number, gloss: number) =>
      `${items} productos de la carta leídos de tus páginas públicas (${online} figuran para pedido en línea). ${gloss} explicaciones cortas de platos las escribimos nosotros como descripciones generales y necesitan tu revisión.`,
    photos: "Fotos y logo",
    photosBody: "0 fotos aprobadas. Cada espacio de imagen del sitio es un marcador provisional, y el logo es un texto de reemplazo, hasta que apruebes archivos reales.",
    demo: "Datos de demostración",
    demoBody: (real: number) =>
      `Este espacio tiene registros de muestra rotulados y ${real} pedido(s) ingresados durante la demostración. Al reiniciar se borra todo lo ingresado aquí y se restauran las muestras.`,
    confirmReset: "Entiendo que esto borra todo lo ingresado en esta demostración.",
    reset: "Reiniciar datos de demostración",
    resetDone: "Se reiniciaron los datos de demostración.",
    resetConfirm: "Marca la casilla para confirmar.",
    resetUnavailable: "El reinicio solo está disponible en modo demostración.",
    export: "Descargar una copia de todo",
    exportBody: "Un archivo con todos los pedidos, cotizaciones, campañas, facturas de muestra y el registro de actividad.",
    exportCta: "Descargar (JSON)",
    log: "Actividad reciente",
    logLead: "Quién hizo qué, y si estaba permitido.",
    logEmpty: "Todavía no hay actividad.",
    visitor: "Visitante del sitio",
    outcome: { ok: "Hecho", denied: "Rechazado", invalid: "No válido", error: "Error" },
    people: "Personas y roles",
  },
} as const;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SettingsPage({ searchParams }: Props) {
  const user = await requirePagePermission("settings.view");
  const locale = await getOwnerLocale(user);
  const shared = ownerDict(locale);
  const t = copy[locale];
  const query = await searchParams;
  const db = await getDb();
  const canManage = can(user.role, "settings.manage");
  const today = businessDateString(new Date());

  const [resolutions, people, [{ value: realInquiries }], recent] = await Promise.all([
    getConflictResolutions(db),
    db.select().from(users),
    db.select({ value: count() }).from(cateringInquiries).where(eq(cateringInquiries.isSynthetic, false)),
    canManage ? db.select().from(auditLog).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(15) : Promise.resolve([]),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const shortDate = (iso: string) => formatIsoDate(iso, locale, { month: "short", day: "numeric", year: "numeric" });
  const orderFreshness = checkFreshness(SOURCES.toast.checkedOn, today);
  const glossCount = MENU_ITEMS.filter((item) => item.descriptionSource === "gloss").length;
  const onlineCount = MENU_ITEMS.filter((item) => item.availability === "online").length;
  const conflictNotice = typeof query.conflict === "string" ? query.conflict : null;
  const resetNotice = typeof query.reset === "string" ? query.reset : null;

  return (
    <>
      <header className="o-head">
        <h1>{shared.nav.settings}</h1>
        <p>{t.lead}</p>
      </header>

      <section className="o-card o-stack o-stack--tight" aria-labelledby="lang-title">
        <h2 className="o-card__title" id="lang-title">
          {t.language}
        </h2>
        <form action={setOwnerLanguage} className="o-row">
          <button className={`o-btn${locale === "en" ? " o-btn--primary" : ""}`} name="locale" value="en" aria-pressed={locale === "en"} lang="en">
            English
          </button>
          <button className={`o-btn${locale === "es" ? " o-btn--primary" : ""}`} name="locale" value="es" aria-pressed={locale === "es"} lang="es">
            Español
          </button>
        </form>
        <p className="o-meta">{t.languageHint}</p>
      </section>

      <section className="o-section" id="facts" aria-labelledby="facts-title">
        <h2 id="facts-title">{t.facts}</h2>
        <p className="o-muted" style={{ marginBottom: "var(--s-4)", fontSize: "var(--text-sm)" }}>
          {t.factsLead}
        </p>
        {conflictNotice ? (
          <p className={`o-notice ${conflictNotice === "saved" ? "o-notice--ok" : "o-notice--warn"}`} role="status" style={{ marginBottom: "var(--s-4)" }}>
            {conflictNotice === "saved" ? t.saved : conflictNotice === "empty_answer" ? t.emptyAnswer : t.notAllowed}
          </p>
        ) : null}
        <div className="o-stack">
          {KNOWN_CONFLICTS.map((conflict) => {
            const resolution = resolutions[conflict.id];
            return (
              <article className="o-card o-stack o-stack--tight" key={conflict.id} id={conflict.id} style={{ scrollMarginTop: 80 }} data-testid="conflict">
                <div className="o-row o-row--between">
                  <h3 className="o-card__title">{conflict.topic[locale]}</h3>
                  {resolution ? <span className="o-badge o-badge--ok">{t.answered}</span> : <span className="o-badge o-badge--outline">{shared.observed}</span>}
                </div>
                <p className="o-muted" style={{ fontSize: "var(--text-sm)" }}>
                  {conflict.detail[locale]}
                </p>
                <div className="o-evidence">
                  <p className="o-evidence__title">{t.whatWeSaw}</p>
                  <ul className="o-stack o-stack--tight" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {conflict.observations.map((observation) => {
                      const source = SOURCES[observation.source];
                      const fresh = checkFreshness(source.checkedOn, today);
                      return (
                        <li key={observation.source}>
                          <span className="o-strong">{observation.value}</span>
                          <br />
                          <span className="o-meta">
                            <a href={source.url} target="_blank" rel="noopener">
                              {source.label[locale]}
                            </a>{" "}
                            · {t.checked} {shortDate(source.checkedOn)}
                            {fresh.stale ? ` · ${t.stale}` : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {resolution ? (
                  <p style={{ fontSize: "var(--text-sm)" }}>
                    <strong>{t.yourAnswer}:</strong> {resolution.answer}{" "}
                    <span className="o-meta">
                      · {names.get(resolution.resolvedBy) ?? resolution.resolvedBy} · {formatInstant(new Date(resolution.resolvedAt), locale)}
                    </span>
                  </p>
                ) : null}
                {canManage ? (
                  <form action={answerConflict} className="o-stack o-stack--tight">
                    <input type="hidden" name="conflictId" value={conflict.id} />
                    <div className="o-field">
                      <label htmlFor={`answer-${conflict.id}`}>{conflict.ownerQuestion[locale]}</label>
                      <input className="o-input" id={`answer-${conflict.id}`} name="answer" maxLength={500} defaultValue={resolution?.answer ?? ""} required />
                      <span className="o-hint">{t.answerHint}</span>
                    </div>
                    <button className="o-btn o-btn--primary">{t.saveAnswer}</button>
                  </form>
                ) : (
                  <p className="o-meta">{t.ownerOnly}</p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="o-section" id="connections" aria-labelledby="conn-title" style={{ scrollMarginTop: 80 }}>
        <h2 id="conn-title">{t.connections}</h2>
        <p className="o-muted" style={{ marginBottom: "var(--s-4)", fontSize: "var(--text-sm)" }}>
          {t.connectionsLead}
        </p>
        <div className="o-stack o-stack--tight">
          <article className="o-card o-card--flat o-stack o-stack--tight">
            <div className="o-row o-row--between">
              <h3 className="o-strong">{t.handoff}</h3>
              <span className={`o-badge ${orderFreshness.stale ? "o-badge--warn" : "o-badge--info"}`}>
                {orderFreshness.stale ? INTEGRATION_STATE_LABEL.stale[locale] : `${t.checked} ${shortDate(SOURCES.toast.checkedOn)}`}
              </span>
            </div>
            <p className="o-muted" style={{ fontSize: "var(--text-sm)" }}>
              {t.handoffBody}
            </p>
          </article>
          {INTEGRATIONS.map((integration) => (
            <article className="o-card o-card--flat o-stack o-stack--tight" key={integration.id} data-testid="integration" data-state={integration.state}>
              <div className="o-row o-row--between">
                <h3 className="o-strong">{integration.name[locale]}</h3>
                <span className="o-badge">{INTEGRATION_STATE_LABEL[integration.state][locale]}</span>
              </div>
              <p className="o-muted" style={{ fontSize: "var(--text-sm)" }}>
                {integration.detail[locale]}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="o-section" aria-labelledby="content-title">
        <h2 id="content-title">{t.content}</h2>
        <div className="o-stack o-stack--tight">
          <p className="o-card o-card--flat" style={{ fontSize: "var(--text-sm)" }}>
            {t.contentBody(MENU_ITEMS.length, onlineCount, glossCount)}{" "}
            <span className="o-meta">
              ({t.checked} {shortDate(MENU_CHECKED_ON)})
            </span>
          </p>
          <p className="o-card o-card--flat" style={{ fontSize: "var(--text-sm)" }}>
            <strong>{t.photos}.</strong> {t.photosBody}
          </p>
        </div>
      </section>

      <section className="o-section" aria-labelledby="people-title">
        <h2 id="people-title">{t.people}</h2>
        <div className="o-card o-card--flat">
          <dl className="o-facts">
            {people.map((person) => (
              <div key={person.id} style={{ display: "contents" }}>
                <dt>{shared.roles[person.role]}</dt>
                <dd>
                  {person.name} {person.isDemo ? <span className="o-badge o-badge--synthetic">{shared.sampleData}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {canManage ? (
        <>
          <section className="o-section" id="demo-data" aria-labelledby="demo-title" style={{ scrollMarginTop: 80 }}>
            <h2 id="demo-title">{t.demo}</h2>
            {resetNotice ? (
              <p className={`o-notice ${resetNotice === "done" ? "o-notice--ok" : "o-notice--warn"}`} role="status" style={{ marginBottom: "var(--s-3)" }}>
                {resetNotice === "done" ? t.resetDone : resetNotice === "confirm" ? t.resetConfirm : resetNotice === "unavailable" ? t.resetUnavailable : t.notAllowed}
              </p>
            ) : null}
            <div className="o-card o-card--synthetic o-stack o-stack--tight">
              <p style={{ fontSize: "var(--text-sm)" }}>{t.demoBody(realInquiries)}</p>
              {isDemoMode() ? (
                <form action={resetDemo} className="o-stack o-stack--tight">
                  <label className="o-check">
                    <input type="checkbox" name="confirm" value="yes" />
                    <span>{t.confirmReset}</span>
                  </label>
                  <button className="o-btn o-btn--danger">{t.reset}</button>
                </form>
              ) : null}
            </div>
            <div className="o-card o-stack o-stack--tight" style={{ marginTop: "var(--s-4)" }}>
              <h3 className="o-strong">{t.export}</h3>
              <p className="o-muted" style={{ fontSize: "var(--text-sm)" }}>
                {t.exportBody}
              </p>
              <a className="o-btn" href="/owner/settings/export" download>
                {t.exportCta}
              </a>
            </div>
          </section>

          <section className="o-section" aria-labelledby="log-title">
            <h2 id="log-title">{t.log}</h2>
            <p className="o-muted" style={{ marginBottom: "var(--s-3)", fontSize: "var(--text-sm)" }}>
              {t.logLead}
            </p>
            {recent.length === 0 ? (
              <div className="o-empty">{t.logEmpty}</div>
            ) : (
              <div className="o-table-wrap">
                <table className="o-table">
                  <tbody>
                    {recent.map((entry) => (
                      <tr key={entry.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{formatInstant(entry.at, locale)}</td>
                        <td>{entry.actorId ? (names.get(entry.actorId) ?? entry.actorId) : t.visitor}</td>
                        <td>{entry.action}</td>
                        <td>
                          <span className={`o-badge ${entry.outcome === "ok" ? "o-badge--ok" : "o-badge--danger"}`}>{t.outcome[entry.outcome]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
