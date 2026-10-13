import { describe, expect, it } from "vitest";
import { MENU_CHECKED_ON } from "@/content/menu";
import { buildApprovalPayload, CHANNELS, hashPayload, isApprovalCurrent, shortReference } from "./approval";
import { canonicalJson } from "./canonical";
import { buildDraft, generateCreatives } from "./templates";
import type { CampaignContent, CreativeContent } from "./types";

const base = (): CampaignContent => buildDraft("weekday_lunch", { code: "LUNCH-AB12", today: "2026-10-13", locale: "en" });
const hashOf = (campaign: CampaignContent, creatives: CreativeContent[] = generateCreatives(campaign)) =>
  hashPayload(buildApprovalPayload(campaign, creatives));

describe("what is being approved", () => {
  it("contains the exact content: plan, dishes with prices, link, counting, spend, texts and channels", () => {
    const campaign = base();
    const creatives = generateCreatives(campaign);
    const payload = buildApprovalPayload(campaign, creatives);

    expect(payload).toMatchObject({
      version: 1,
      code: "LUNCH-AB12",
      name: "Weekday lunch",
      useCase: "weekday_lunch",
      objective: "order_pickup",
      offer: { type: "none" },
      budgetCents: 0,
      menuCheckedOn: MENU_CHECKED_ON,
      landing: { en: "/en/menu?c=LUNCH-AB12", es: "/es/menu?c=LUNCH-AB12" },
      schedule: campaign.schedule,
    });
    expect(payload.featuredItems).toEqual([
      { id: "pan-con-chicharron", name: "Pan con Chicharrón", priceCents: 1399, availability: "online" },
      { id: "pan-con-pollo", name: "Pan con Pollo", priceCents: 1299, availability: "online" },
      { id: "butifarra", name: "Butifarra", priceCents: 1299, availability: "online" },
    ]);
    expect(payload.audience).toBe(campaign.audience);
    expect(payload.tracking.en).toContain("LUNCH-AB12");
    expect(payload.tracking.en).toContain("A tap is not an order");
    expect(payload.tracking.es).toContain("Un toque no es un pedido");
    // Every text, in both languages.
    expect(payload.creatives).toHaveLength(8);
    expect(payload.creatives.map((c) => `${c.kind}:${c.locale}`)).toEqual([
      "caption:en",
      "caption:es",
      "reel_script:en",
      "reel_script:es",
      "shot_list:en",
      "shot_list:es",
      "email:en",
      "email:es",
    ]);
    expect(payload.creatives[0].body).toBe(creatives.find((c) => c.kind === "caption" && c.locale === "en")!.body);
    // No channel is connected: every one is export only.
    expect(payload.channels).toEqual(CHANNELS.map((channel) => ({ channel, state: "not_connected_export_only" })));
    expect(JSON.stringify(payload)).not.toMatch(/"(connected|published|sent|live)"/);
  });

  it("gives identical content the same fingerprint, whatever order things are stored in", () => {
    const campaign = base();
    const creatives = generateCreatives(campaign);
    const first = hashOf(campaign, creatives);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOf(base(), generateCreatives(base()))).toBe(first);
    // Texts read back from the database in another order.
    expect(hashOf(campaign, [...creatives].reverse())).toBe(first);
    // Fields written in another order, as a JSON column may return them.
    const shuffled = Object.fromEntries(Object.entries(campaign).reverse()) as CampaignContent;
    const schedule = Object.fromEntries(Object.entries(campaign.schedule).reverse()) as CampaignContent["schedule"];
    expect(hashOf({ ...shuffled, schedule }, creatives)).toBe(first);
    // Stored and read back as JSON.
    const payload = buildApprovalPayload(campaign, creatives);
    expect(hashPayload(JSON.parse(JSON.stringify(payload)))).toBe(first);
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(shortReference(first)).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it("changes the fingerprint on any edit", () => {
    const campaign = base();
    const creatives = generateCreatives(campaign);
    const original = hashOf(campaign, creatives);
    const edits: Array<[string, CampaignContent]> = [
      ["name", { ...campaign, name: "Weekday lunch!" }],
      ["audience", { ...campaign, audience: `${campaign.audience} ` }],
      ["objective", { ...campaign, objective: "directions" }],
      ["landing page", { ...campaign, landingPath: "/visit" }],
      ["code", { ...campaign, code: "LUNCH-ZZ99" }],
      ["budget", { ...campaign, budgetCents: 1 }],
      ["dishes", { ...campaign, featuredItemIds: ["pan-con-chicharron", "pan-con-pollo"] }],
      ["dish order", { ...campaign, featuredItemIds: [...campaign.featuredItemIds].reverse() }],
      ["first day", { ...campaign, schedule: { ...campaign.schedule, startsOn: "2026-10-15" } }],
      ["last day", { ...campaign, schedule: { ...campaign.schedule, endsOn: "2026-11-11" } }],
      ["days", { ...campaign, schedule: { ...campaign.schedule, weekdays: [1, 2, 3, 4] } }],
      ["start time", { ...campaign, schedule: { ...campaign.schedule, startTime: "11:30" } }],
      ["end time", { ...campaign, schedule: { ...campaign.schedule, endTime: "14:30" } }],
      [
        "offer",
        {
          ...campaign,
          offer: {
            type: "limited_test",
            description: "x",
            eligibleItemIds: ["butifarra"],
            exclusions: "None",
            quantityLimit: "no_limit",
            redemptionControl: "y",
            contributionMarginNote: null,
          },
        },
      ],
    ];
    const seen = new Set([original]);
    for (const [what, edited] of edits) {
      const hash = hashOf(edited, creatives);
      expect(hash, what).not.toBe(original);
      seen.add(hash);
    }
    expect(seen.size).toBe(edits.length + 1);

    // One character in one text, in either language, of any kind.
    for (const target of creatives) {
      const edited = creatives.map((c) => (c === target ? { ...c, body: `${c.body}.` } : c));
      expect(hashOf(campaign, edited), `${target.kind} ${target.locale}`).not.toBe(original);
    }
    // A text that disappears.
    expect(hashOf(campaign, creatives.slice(1))).not.toBe(original);
    // The same days in another order are the same content.
    expect(hashOf({ ...campaign, schedule: { ...campaign.schedule, weekdays: [5, 4, 3, 2, 1] } }, creatives)).toBe(original);
  });

  it("treats an approval as current only for exactly the approved content", () => {
    const campaign = base();
    const creatives = generateCreatives(campaign);
    const approval = { decision: "approved" as const, payloadHash: hashOf(campaign, creatives) };

    expect(isApprovalCurrent({ ...campaign, status: "approved" }, creatives, approval)).toBe(true);
    // No decision, or a different kind of decision.
    expect(isApprovalCurrent({ ...campaign, status: "approved" }, creatives, null)).toBe(false);
    expect(isApprovalCurrent({ ...campaign, status: "approved" }, creatives, { ...approval, decision: "revoked" })).toBe(false);
    expect(isApprovalCurrent({ ...campaign, status: "approved" }, creatives, { ...approval, decision: "changes_requested" })).toBe(false);
    // Not in the approved state.
    expect(isApprovalCurrent({ ...campaign, status: "draft" }, creatives, approval)).toBe(false);
    expect(isApprovalCurrent({ ...campaign, status: "pending_approval" }, creatives, approval)).toBe(false);
    // Content edited after approval, even if the status was never touched.
    expect(isApprovalCurrent({ ...campaign, status: "approved", budgetCents: 2500 }, creatives, approval)).toBe(false);
    const edited = creatives.map((c, index) => (index === 0 ? { ...c, body: `${c.body} New line.`, origin: "owner_edit" as const } : c));
    expect(isApprovalCurrent({ ...campaign, status: "approved" }, edited, approval)).toBe(false);
  });
});
