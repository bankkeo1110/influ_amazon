import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getSession } from "@/lib/session";

const BASE = "https://graph.facebook.com/v19.0";

// POST /api/facebook/posts/recurring
// Body: { fbPageId, pageId, startDate, intervalDays, count }
// Pulls `count` items from ContentQueue and schedules them
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fbPageId, pageId, startDate, intervalDays, count } = await req.json() as {
    fbPageId: string;
    pageId: string;
    startDate: string;
    intervalDays: number;
    count: number;
  };

  if (!fbPageId || !pageId || !startDate || !intervalDays || !count) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const page = await prisma.facebookPage.findFirst({
    where: { pageId: fbPageId, userId: session.userId },
  });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const pageToken = decrypt(page.accessToken);

  // Pull unconsumed queue items in order
  const queueItems = await prisma.contentQueueItem.findMany({
    where: { pageId, consumed: false },
    orderBy: { sortOrder: "asc" },
    take: count,
  });

  if (queueItems.length === 0) {
    return NextResponse.json({ error: "Content queue is empty" }, { status: 400 });
  }

  const seriesId = `series_${Date.now()}`;
  const results: { index: number; ok: boolean; error?: string }[] = [];
  const start = new Date(startDate);
  const minTs = Math.floor(Date.now() / 1000) + 600;

  for (let i = 0; i < queueItems.length; i++) {
    const item = queueItems[i];
    const postDate = new Date(start.getTime() + i * intervalDays * 24 * 60 * 60 * 1000);
    const ts = Math.max(Math.floor(postDate.getTime() / 1000), minTs + i * 60);

    const formData = new URLSearchParams({
      message: item.message,
      published: "false",
      scheduled_publish_time: String(ts),
      access_token: pageToken,
    });
    if (item.link) formData.append("link", item.link);

    const fbRes = await fetch(`${BASE}/${fbPageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    const fbData = await fbRes.json();

    if (fbData.error) {
      results.push({ index: i, ok: false, error: fbData.error.message });
      await prisma.facebookPost.create({
        data: {
          pageId,
          message: item.message,
          link: item.link,
          status: "failed",
          scheduledTime: postDate,
          isRecurring: true,
          recurringSeriesId: seriesId,
          errorMessage: fbData.error.message,
        },
      });
    } else {
      results.push({ index: i, ok: true });
      await prisma.facebookPost.create({
        data: {
          fbPostId: fbData.id,
          pageId,
          message: item.message,
          link: item.link,
          status: "scheduled",
          scheduledTime: postDate,
          isRecurring: true,
          recurringSeriesId: seriesId,
        },
      });
      await prisma.contentQueueItem.update({
        where: { id: item.id },
        data: { consumed: true },
      });
    }
  }

  return NextResponse.json({ ok: true, seriesId, results });
}
