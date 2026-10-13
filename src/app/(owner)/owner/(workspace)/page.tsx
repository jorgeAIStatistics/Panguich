import type { Metadata } from "next";
import Link from "next/link";
import { ActionCardView } from "@/components/owner/ActionCardView";
import { getDb } from "@/db/client";
import { requirePagePermission } from "@/lib/auth/session";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { formatInstant } from "@/lib/time";
import { getTodayCards } from "@/modules/today/service";

export const metadata: Metadata = { title: "Today" };

const copy = {
  en: {
    lead: "The few things that need you, most urgent first.",
    none: "Nothing needs you right now.",
    noneBody: "New catering requests, follow-ups and items to review will appear here.",
    waiting: (n: number) => (n === 1 ? "1 more item is waiting in its section:" : `${n} more items are waiting in their sections:`),
    cantSee: "What this screen cannot see yet",
    cantSeeBody: "Sales, orders and guest counts are not shown because Toast is not connected to this workspace. Nothing here is a sales figure.",
    cantSeeLink: "See connections",
  },
  es: {
    lead: "Lo poco que necesita tu atención, lo más urgente primero.",
    none: "Nada necesita tu atención ahora.",
    noneBody: "Aquí aparecerán los nuevos pedidos de catering, los seguimientos y lo que haya que revisar.",
    waiting: (n: number) => (n === 1 ? "Hay 1 asunto más esperando en su sección:" : `Hay ${n} asuntos más esperando en sus secciones:`),
    cantSee: "Lo que esta pantalla todavía no puede ver",
    cantSeeBody: "No se muestran ventas, pedidos ni número de clientes porque Toast no está conectado a este espacio. Nada de lo que ves aquí es una cifra de ventas.",
    cantSeeLink: "Ver conexiones",
  },
} as const;

export default async function TodayPage() {
  const user = await requirePagePermission("today.view");
  const locale = await getOwnerLocale(user);
  const shared = ownerDict(locale);
  const t = copy[locale];
  const now = new Date();
  const { shown, waiting } = await getTodayCards(await getDb(), user.role, locale, now);

  return (
    <>
      <header className="o-head">
        <p className="o-head__eyebrow">{formatInstant(now, locale, { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1>{shared.nav.today}</h1>
        <p>{t.lead}</p>
      </header>

      {shown.length === 0 ? (
        <div className="o-empty">
          <strong>{t.none}</strong>
          {t.noneBody}
        </div>
      ) : (
        <div className="o-stack">
          {shown.map((card, index) => (
            <ActionCardView key={card.id} card={card} rank={index + 1} t={shared} />
          ))}
        </div>
      )}

      {waiting.length > 0 ? (
        <section className="o-section" aria-label={t.waiting(waiting.length)}>
          <p className="o-muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--s-2)" }}>
            {t.waiting(waiting.length)}
          </p>
          <ul className="o-stack o-stack--tight" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {waiting.map((card) => (
              <li key={card.id}>
                <Link className="o-card o-card--flat o-card--link" href={card.nextAction.href} style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                  {card.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="o-section">
        <div className="o-notice">
          <strong>{t.cantSee}.</strong> {t.cantSeeBody}{" "}
          {user.role !== "staff" ? (
            <Link href="/owner/settings#connections" style={{ fontWeight: 700 }}>
              {t.cantSeeLink}
            </Link>
          ) : null}
        </div>
      </section>
    </>
  );
}
