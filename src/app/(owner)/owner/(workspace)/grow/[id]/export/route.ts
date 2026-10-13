import { NextResponse } from "next/server";
import { siteUrl } from "@/content/business";
import { getDb } from "@/db/client";
import { PermissionError } from "@/lib/auth/permissions";
import { getSessionUser, toActor } from "@/lib/auth/session";
import { getOwnerLocale } from "@/lib/owner/locale";
import { exportCampaign } from "@/modules/growth/service";

export const dynamic = "force-dynamic";

/**
 * Downloads one campaign's drafts as a text file for the owner to copy from.
 * It is only a download: nothing is published or sent. The file's first line says
 * "DRAFT – NOT APPROVED" unless the exact content in it is currently approved.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const db = await getDb();

  // The public address is not decided yet. Use the configured one if there is one, otherwise
  // the address this workspace is being used from, and say in the file that it is provisional.
  const configured = Boolean(process.env.PANGUICH_SITE_URL);
  const siteOrigin = configured ? siteUrl() : new URL(request.url).origin;

  let file;
  try {
    // Checks "growth.view" and records a refusal in the audit log.
    file = await exportCampaign(db, toActor(user), {
      campaignId: id,
      locale: await getOwnerLocale(user),
      siteOrigin,
      siteOriginIsProvisional: !configured,
    });
  } catch (error) {
    if (error instanceof PermissionError) return new NextResponse(null, { status: 403 });
    throw error;
  }
  if (!file) return new NextResponse(null, { status: 404 });

  return new NextResponse(file.body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
