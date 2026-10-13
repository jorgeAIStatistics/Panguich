import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { createRateLimiter } from "@/lib/rate-limit";
import { recordSiteEvent, siteEventInput } from "@/modules/tracking/service";

export const dynamic = "force-dynamic";

// Generous enough for a real visit, small enough that one client cannot flood the table.
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const MAX_BODY_BYTES = 1_000;

/** Records one anonymous website tap or page view. Always answers quickly and never leaks details. */
export async function POST(request: NextRequest) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!limiter.allow(client, Date.now())) return new NextResponse(null, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = siteEventInput.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  try {
    await recordSiteEvent(await getDb(), parsed.data);
  } catch {
    // Tracking is best-effort; the visitor's action has already happened.
    return new NextResponse(null, { status: 503 });
  }
  return new NextResponse(null, { status: 204 });
}
