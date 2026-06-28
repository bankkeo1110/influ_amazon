import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getSession } from "@/lib/session";

const BASE = "https://graph.facebook.com/v19.0";

function requireAuth(session: Awaited<ReturnType<typeof import("@/lib/session").getSession>>) {
  if (!session.userId) throw new Error("Unauthorized");
}

async function getPageToken(pageId: string, userId: string): Promise<string> {
  const page = await prisma.facebookPage.findFirst({
    where: { pageId, userId },
  });
  if (!page) throw new Error("Page not found or not authorized");
  return decrypt(page.accessToken);
}

// GET /api/facebook/posts?pageId=xxx — list posts tracked in our DB
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pageId = req.nextUrl.searchParams.get("pageId");
  if (!pageId) return NextResponse.json({ error: "pageId required" }, { status: 400 });

  const posts = await prisma.facebookPost.findMany({
    where: { page: { pageId, userId: session.userId } },
    orderBy: { scheduledTime: "asc" },
  });

  return NextResponse.json({ posts });
}

// POST /api/facebook/posts — create immediate or scheduled post
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    pageId,        // our DB pageId (string cuid)
    fbPageId,      // the actual Facebook page ID
    message,
    link,
    scheduledTime, // ISO string or null for immediate
    isRecurring,
    recurringSeriesId,
  } = body as {
    pageId: string;
    fbPageId: string;
    message: string;
    link?: string;
    scheduledTime?: string;
    isRecurring?: boolean;
    recurringSeriesId?: string;
  };

  if (!message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });

  let pageToken: string;
  try {
    pageToken = await getPageToken(fbPageId, session.userId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const isScheduled = !!scheduledTime;
  const formData: Record<string, string> = {
    message,
    access_token: pageToken,
  };

  if (link) formData.link = link;

  if (isScheduled) {
    const ts = Math.floor(new Date(scheduledTime!).getTime() / 1000);
    const minTs = Math.floor(Date.now() / 1000) + 600; // FB requires at least 10 min in future
    if (ts < minTs) {
      return NextResponse.json(
        { error: "Scheduled time must be at least 10 minutes in the future" },
        { status: 400 }
      );
    }
    formData.published = "false";
    formData.scheduled_publish_time = String(ts);
  }

  const fbRes = await fetch(`${BASE}/${fbPageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(formData).toString(),
  });

  const fbData = await fbRes.json();

  if (fbData.error) {
    // Save failed post for visibility
    await prisma.facebookPost.create({
      data: {
        pageId,
        message,
        link,
        status: "failed",
        scheduledTime: isScheduled ? new Date(scheduledTime!) : null,
        isRecurring: isRecurring ?? false,
        recurringSeriesId,
        errorMessage: fbData.error.message,
      },
    });
    return NextResponse.json({ error: fbData.error.message, fbCode: fbData.error.code }, { status: 400 });
  }

  const post = await prisma.facebookPost.create({
    data: {
      fbPostId: fbData.id,
      pageId,
      message,
      link,
      status: isScheduled ? "scheduled" : "published",
      scheduledTime: isScheduled ? new Date(scheduledTime!) : null,
      isRecurring: isRecurring ?? false,
      recurringSeriesId,
    },
  });

  return NextResponse.json({ ok: true, post });
}
