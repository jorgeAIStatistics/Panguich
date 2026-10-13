import { CREATIVE_KINDS } from "@/db/schema";
import { LOCALES } from "@/lib/i18n";
import { rebuildTextsAction, saveTextsAction } from "../actions";
import { LINK_PLACEHOLDER } from "../templates";
import styles from "./grow.module.css";
import { CHECK_NOTICE, type GrowView } from "./view";

/** The automatic checks, most serious first. Each one says in words how serious it is. */
export function ChecksSection({ view, t }: GrowView) {
  return (
    <section className="o-section" id="checks" aria-labelledby="checks-title">
      <h2 id="checks-title">{t.detail.checksTitle}</h2>
      <p className="o-meta" style={{ marginBottom: "var(--s-3)" }}>
        {t.detail.checksLead}
      </p>
      {view.checks.length === 0 ? (
        <p className="o-notice o-notice--ok" data-testid="checks-clear">
          {t.detail.checksClear}
        </p>
      ) : (
        <ul className={styles.list} data-testid="checks">
          {view.checks.map((check) => (
            <li key={check.code + check.message} className={CHECK_NOTICE[check.level]} data-testid={`check-${check.code}`} data-level={check.level}>
              <strong>{t.detail.level[check.level]}.</strong> {check.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The draft texts, English beside Spanish, one form per kind of text. */
export function TextsSection({ view, t, perms }: GrowView) {
  const { campaign, creatives } = view;
  const editable = perms.edit && campaign.status !== "archived";

  return (
    <section className="o-section" id="texts" aria-labelledby="texts-title">
      <h2 id="texts-title">{t.detail.textsTitle}</h2>
      <p className="o-notice" style={{ marginBottom: "var(--s-3)" }}>
        {t.templateNote}
      </p>
      <p className="o-meta" style={{ marginBottom: "var(--s-3)" }}>
        {t.detail.textsLead} {t.detail.linkHint(LINK_PLACEHOLDER.en, LINK_PLACEHOLDER.es)}
      </p>
      <div className="o-stack">
        {CREATIVE_KINDS.map((kind) => {
          const fields = LOCALES.map((language) => {
            const creative = creatives.find((entry) => entry.kind === kind && entry.locale === language);
            const id = `text-${kind}-${language}`;
            return (
              <div className="o-field" key={language}>
                <div className="o-row o-row--between">
                  <label htmlFor={id} lang={language}>
                    {t.languages[language]}
                  </label>
                  {creative ? (
                    <span className={`o-badge ${creative.origin === "template" ? "o-badge--outline" : "o-badge--info"}`} data-testid={`origin-${kind}-${language}`}>
                      {t.origin[creative.origin]}
                    </span>
                  ) : null}
                </div>
                {editable ? (
                  <textarea
                    className={`o-textarea ${styles.textBox}`}
                    id={id}
                    name={`body:${kind}:${language}`}
                    defaultValue={creative?.body ?? ""}
                    lang={language}
                    maxLength={6000}
                    data-testid={`creative-${kind}-${language}`}
                  />
                ) : (
                  <pre className="o-pre" id={id} lang={language} data-testid={`creative-${kind}-${language}`}>
                    {creative?.body ?? ""}
                  </pre>
                )}
              </div>
            );
          });
          return editable ? (
            <form key={kind} action={saveTextsAction} className="o-card o-stack">
              <input type="hidden" name="campaignId" value={campaign.id} />
              <h3>{t.kinds[kind]}</h3>
              <div className="o-grid-2">{fields}</div>
              <button className="o-btn" type="submit" data-testid={`save-${kind}`}>
                {t.detail.saveTexts}
              </button>
            </form>
          ) : (
            <div key={kind} className="o-card o-stack">
              <h3>{t.kinds[kind]}</h3>
              <div className="o-grid-2">{fields}</div>
            </div>
          );
        })}

        {editable ? (
          <form action={rebuildTextsAction} className="o-stack o-stack--tight">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <p className="o-meta">{t.detail.rebuildHint}</p>
            <div>
              <button className="o-btn o-btn--quiet" type="submit" data-testid="rebuild-texts">
                {t.detail.rebuild}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}
