import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CallLink } from "@/components/site/links";
import { siteCopy } from "@/content/site-copy";
import { isDemoMode } from "@/lib/demo";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { CateringInquiryForm } from "@/modules/catering/components/InquiryForm";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = siteCopy(lang);
  return pageMetadata(lang, "/catering", t.catering.title, t.catering.description);
}

export default async function CateringPage({ params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = siteCopy(lang);
  const c = t.catering;

  return (
    <div data-track-view="catering_view">
      <div className="s-wrap s-pagehead">
        <p className="s-eyebrow">{c.eyebrow}</p>
        <h1>{c.h1}</h1>
        <p>{c.lead}</p>
      </div>

      <section className="s-wrap" aria-labelledby="steps-title" style={{ paddingBottom: "var(--s-6)" }}>
        <h2 className="visually-hidden" id="steps-title">
          {c.stepsTitle}
        </h2>
        <ol className="s-steps">
          {c.steps.map((step) => (
            <li key={step.title}>
              <div>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="s-section s-section--deep" aria-labelledby="form-title">
        <div className="s-wrap s-two">
          <div>
            <h2 className="s-h2" id="form-title">
              {c.formTitle}
            </h2>
            <p className="s-sub">{c.honest}</p>
            {isDemoMode() ? (
              <p className="s-source" style={{ marginTop: "var(--s-4)", maxWidth: "46ch" }}>
                <span className="s-draft">{c.draft}</span> {c.draftNote}
              </p>
            ) : null}
            <p style={{ marginTop: "var(--s-5)", fontWeight: 700 }}>{c.prefer}</p>
            <div className="s-hero__cta" style={{ marginTop: "var(--s-2)" }}>
              <CallLink t={t} />
            </div>
          </div>
          <CateringInquiryForm locale={lang} />
        </div>
      </section>
    </div>
  );
}
