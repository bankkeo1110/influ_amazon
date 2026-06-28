import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// GET /api/facebook/queue?pageId=xxx
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pageId = req.nextUrl.searchParams.get("pageId");
  if (!pageId) return NextResponse.json({ error: "pageId required" }, { status: 400 });

  const items = await prisma.contentQueueItem.findMany({
    where: { pageId, page: { userId: session.userId } },
    orderBy: [{ consumed: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ items });
}

// POST /api/facebook/queue — add a draft to the queue
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pageId, message, link } = await req.json() as {
    pageId: string;
    message: string;
    link?: string;
  };

  if (!pageId || !message?.trim()) {
    return NextResponse.json({ error: "pageId and message are required" }, { status: 400 });
  }

  const page = await prisma.facebookPage.findFirst({
    where: { id: pageId, userId: session.userId },
  });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const last = await prisma.contentQueueItem.findFirst({
    where: { pageId },
    orderBy: { sortOrder: "desc" },
  });

  const item = await prisma.contentQueueItem.create({
    data: {
      pageId,
      message,
      link,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  return NextResponse.json({ ok: true, item });
}
