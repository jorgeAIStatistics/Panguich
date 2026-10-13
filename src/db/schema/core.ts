import { boolean, index, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** People who can sign in to the owner workspace. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").$type<Role>().notNull(),
  locale: text("locale").$type<Locale>().notNull().default("en"),
  /** Demo identities can never trigger a live send, payment, or external write. */
  isDemo: boolean("is_demo").notNull().default(true),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export type AuditOutcome = "ok" | "denied" | "invalid" | "error";

/** Append-only record of who did (or was refused) what. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    at: tz("at").notNull().defaultNow(),
    /** null = website visitor or the system itself. */
    actorId: text("actor_id"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    permission: text("permission"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    outcome: text("outcome").$type<AuditOutcome>().notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_at_idx").on(t.at)],
);

export const SITE_EVENT_TYPES = [
  "menu_view",
  "order_handoff",
  "delivery_handoff",
  "directions_click",
  "call_click",
  "catering_view",
  "catering_submit",
] as const;
export type SiteEventType = (typeof SITE_EVENT_TYPES)[number];

/**
 * Anonymous website activity. A click is a click: never an order, revenue, or a visit.
 * No personal information is stored here.
 */
export const siteEvents = pgTable(
  "site_events",
  {
    id: serial("id").primaryKey(),
    /** Generated in the browser so a retried request is not counted twice. */
    clientEventId: text("client_event_id").notNull().unique(),
    type: text("type").$type<SiteEventType>().notNull(),
    locale: text("locale"),
    path: text("path"),
    campaignCode: text("campaign_code"),
    occurredAt: tz("occurred_at").notNull().defaultNow(),
  },
  (t) => [index("site_events_type_idx").on(t.type, t.occurredAt)],
);

/** Small key/value store for owner-controlled settings. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"),
});
