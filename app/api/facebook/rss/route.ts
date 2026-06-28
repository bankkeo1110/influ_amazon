import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getSession } from "@/lib/session";

const BASE = "https://graph.facebook.com/v19.0";

// GET /api/facebook/rss?url=... — preview RSS items
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    const parser = new Parser({ timeout: 10000 });
    const feed = await parser.parseURL(url);
    const items = feed.items.slice(0, 30).map((item) => ({
      title: item.title ?? "",
      link: item.link ?? "",
      snippet: (item.contentSnippet ?? item.summary ?? "").slice(0, 300),
      pubDate: item.pubDate ?? "",
    }));
    return NextResponse.json({ feedTitle: feed.title ?? url, items });
  } catch {
    return NextResponse.json(
      { error: "Could not fetch or parse RSS feed. Check the URL and try again." },
      { status: 400 }
    );
  }
}

// POST /api/facebook/rss — schedule all items every N days
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fbPageId, pageId, rssUrl, intervalDays = 3, maxItems = 10, startDate } = await req.json() as {
    fbPageId: string;
    pageId: string;
    rssUrl: string;
    intervalDays?: number;
    maxItems?: number;
    startDate?: string;
  };

  const page = await prisma.facebookPage.findFirst({
    where: { pageId: fbPageId, userId: session.userId },
  });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const pageToken = decrypt(page.accessToken);

  const parser = new Parser({ timeout: 10000 });
  const feed = await parser.parseURL(rssUrl);
  const items = feed.items.slice(0, Math.min(maxItems, 50));

  if (items.length === 0) {
    return NextResponse.json({ error: "RSS feed has no items" }, { status: 400 });
  }

  // Start 15 min from now minimum (FB requires 10 min buffer)
  const start = startDate
    ? new Date(startDate)
    : new Date(Date.now() + 15 * 60 * 1000);

  const results: { index: number; title: string; ok: boolean; error?: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const postDate = new Date(start.getTime() + i * intervalDays * 24 * 60 * 60 * 1000);
    const ts = Math.floor(postDate.getTime() / 1000);

    const message = [item.title, (item.contentSnippet ?? "").slice(0, 500)]
      .filter(Boolean)
      .join("\n\n");

    const body = new URLSearchParams({
      message,
      published: "false",
      scheduled_publish_time: String(ts),
      access_token: pageToken,
    });
    if (item.link) body.append("link", item.link);

    const fbRes = await fetch(`${BASE}/${fbPageId}/feed`, {
      method: "POST",
      body,
    });
    const fbData = await fbRes.json();

    if (fbData.error) {
      results.push({ index: i, title: item.title ?? "", ok: false, error: fbData.error.message });
    } else {
      results.push({ index: i, title: item.title ?? "", ok: true });
      await prisma.facebookPost.create({
        data: {
          fbPostId: fbData.id,
          pageId,
          message,
          link: item.link ?? null,
          status: "scheduled",
          scheduledTime: postDate,
        },
      });
    }
  }

  const scheduled = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, scheduled, total: items.length, results });
}
