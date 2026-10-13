import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderLink } from "@/components/site/links";
import { MenuBrowser, type MenuBrowserItem } from "@/components/site/MenuBrowser";
import { BUSINESS } from "@/content/business";
import { MENU_CATEGORIES, MENU_CHECKED_ON, MENU_ITEMS } from "@/content/menu";
import { fill, siteCopy } from "@/content/site-copy";
import { isLocale } from "@/lib/i18n";
import { formatUsd } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";
import { normalizeForSearch } from "@/lib/text";
import { formatIsoDate } from "@/lib/time";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = siteCopy(lang);
  return pageMetadata(lang, "/menu", t.menu.title, t.menu.description);
}

export default async function MenuPage({ params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = siteCopy(lang);
  const m = t.menu;
  const checked = formatIsoDate(MENU_CHECKED_ON, lang, { month: "long", day: "numeric", year: "numeric" });
  const categoryNames = new Map(MENU_CATEGORIES.map((c) => [c.id, `${c.name.en} ${c.name.es}`]));

  const items: MenuBrowserItem[] = MENU_ITEMS.map((item) => ({
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    price: formatUsd(item.priceCents, lang),
    description: item.description?.[lang],
    note: item.note?.[lang],
    availability: item.availability,
    featured: Boolean(item.featuredOnToast),
    haystack: normalizeForSearch(
      [item.name, item.description?.en, item.description?.es, categoryNames.get(item.categoryId)].filter(Boolean).join(" "),
    ),
  }));
  const categories = MENU_CATEGORIES.map((c) => ({ id: c.id, name: c.name[lang], blurb: c.blurb?.[lang] }));

  return (
    <div data-track-view="menu_view">
      <div className="s-wrap s-pagehead">
        <p className="s-eyebrow">Panguich · Cooper City</p>
        <h1>{m.h1}</h1>
        <p>{m.lead}</p>
        <div className="s-hero__cta">
          <OrderLink t={t} />
        </div>
        <p className="s-handoff">{t.handoff}</p>
      </div>

      <MenuBrowser locale={lang} categories={categories} items={items} />

      <div className="s-wrap" style={{ paddingBlock: "var(--s-6) var(--s-7)" }}>
        <div className="s-legend">
          <div>
            <span className="s-tag s-tag--online">{m.online}</span>
            <span>{m.legendOnline}</span>
          </div>
          <div>
            <span className="s-tag s-tag--store">{m.inStore}</span>
            <span>{m.legendStore}</span>
          </div>
          <div>
            <span className="s-tag s-tag--featured">{m.featured}</span>
            <span>{m.legendFeatured}</span>
          </div>
        </div>
        <p className="s-notice" style={{ marginTop: "var(--s-5)" }}>
          {BUSINESS.allergyNotice[lang]}
        </p>
        <p className="s-source" style={{ marginTop: "var(--s-3)", maxWidth: "70ch" }}>
          {fill(m.priceNote, { date: checked })}
        </p>
      </div>
    </div>
  );
}
