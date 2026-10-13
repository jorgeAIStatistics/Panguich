"use client";

import { useId, useState } from "react";
import { fill, siteCopy } from "@/content/site-copy";
import type { Locale } from "@/lib/i18n";
import { normalizeForSearch } from "@/lib/text";
import { SearchIcon } from "./icons";

export type MenuBrowserItem = {
  id: string;
  categoryId: string;
  name: string;
  price: string;
  description?: string;
  note?: string;
  availability: "online" | "in_store";
  featured: boolean;
  /** Pre-normalized text (both languages) used for matching. */
  haystack: string;
};

export type MenuBrowserCategory = { id: string; name: string; blurb?: string };

/**
 * The full menu as ordinary HTML, with instant search layered on top.
 * Without JavaScript every dish is still listed and the section links still work.
 */
export function MenuBrowser({ locale, categories, items }: { locale: Locale; categories: MenuBrowserCategory[]; items: MenuBrowserItem[] }) {
  const t = siteCopy(locale).menu;
  const [query, setQuery] = useState("");
  const inputId = useId();
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  const visible = words.length ? items.filter((item) => words.every((word) => item.haystack.includes(word))) : items;
  const shownCategories = categories
    .map((category) => ({ ...category, items: visible.filter((item) => item.categoryId === category.id) }))
    .filter((category) => category.items.length > 0);

  const status = words.length
    ? fill(t.resultsFor, { count: visible.length, query: query.trim() })
    : visible.length === 1
      ? t.resultsOne
      : fill(t.results, { count: visible.length });

  return (
    <>
      <div className="s-menu-tools">
        <div className="s-wrap">
          <form className="s-search" role="search" onSubmit={(event) => event.preventDefault()}>
            <label className="visually-hidden" htmlFor={inputId}>
              {t.searchLabel}
            </label>
            <SearchIcon />
            <input
              id={inputId}
              type="search"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchPlaceholder}
              autoComplete="off"
              enterKeyHint="search"
            />
          </form>
          <nav className="s-catnav" aria-label={t.categories}>
            {shownCategories.map((category) => (
              <a key={category.id} href={`#${category.id}`}>
                {category.name}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <div className="s-wrap">
        <p className="s-menu-status" role="status" aria-live="polite">
          {status}
        </p>

        {shownCategories.length === 0 ? (
          <div className="s-empty">
            <p>
              <strong>{fill(t.none, { query: query.trim() })}</strong>
            </p>
            <p>{t.noneHint}</p>
            <p style={{ marginTop: "var(--s-3)" }}>
              <button type="button" className="s-btn s-btn--sm" onClick={() => setQuery("")}>
                {t.clear}
              </button>
            </p>
          </div>
        ) : null}

        {shownCategories.map((category) => (
          <section className="s-category" id={category.id} key={category.id} aria-labelledby={`${category.id}-title`}>
            <div className="s-category__head">
              <h2 id={`${category.id}-title`}>{category.name}</h2>
              <span>{fill(t.items, { count: category.items.length })}</span>
            </div>
            {category.blurb ? <p className="s-category__blurb">{category.blurb}</p> : null}
            <ul className="s-items">
              {category.items.map((item) => (
                <li className="s-item" id={item.id} key={item.id} style={{ scrollMarginTop: 190 }} data-testid="menu-item">
                  <div className="s-item__line">
                    <span className="s-item__name">{item.name}</span>
                    <span className="s-item__dots" aria-hidden="true" />
                    <span className="s-item__price">{item.price}</span>
                  </div>
                  {item.description ? <p className="s-item__desc">{item.description}</p> : null}
                  {item.note ? <p className="s-item__note">{item.note}</p> : null}
                  {item.featured ? <span className="s-tag s-tag--featured">{t.featured}</span> : null}
                  <span className={`s-tag ${item.availability === "online" ? "s-tag--online" : "s-tag--store"}`}>
                    {item.availability === "online" ? t.online : t.inStore}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
