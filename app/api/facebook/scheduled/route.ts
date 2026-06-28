import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getSession } from "@/lib/session";

const BASE = "https://graph.facebook.com/v19.0";

// GET /api/facebook/scheduled?fbPageId=xxx
// Fetches live scheduled posts from Facebook Graph API
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fbPageId = req.nextUrl.searchParams.get("fbPageId");
  if (!fbPageId) return NextResponse.json({ error: "fbPageId required" }, { status: 400 });

  const page = await prisma.facebookPage.findFirst({
    where: { pageId: fbPageId, userId: session.userId },
  });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const pageToken = decrypt(page.accessToken);
  const params = new URLSearchParams({
    fields: "id,message,scheduled_publish_time,full_picture,permalink_url",
    access_token: pageToken,
    limit: "50",
  });

  const res = await fetch(`${BASE}/${fbPageId}/scheduled_posts?${params}`);
  const data = await res.json();

  if (data.error) {
    return NextResponse.json({ error: data.error.message, code: data.error.code }, { status: 400 });
  }

  return NextResponse.json({ posts: data.data ?? [] });
}
