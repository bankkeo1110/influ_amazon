import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findChannels } from "@/lib/channelFinder";

// Runs after the response has already been sent. This is safe because the app runs as
// a persistent Node process (`next dev` / `next start`) — the event loop keeps going
// regardless of whether the client is still connected. If this ever moves to a
// serverless/edge runtime that freezes execution after the response, this would need
// a real background job queue instead.
async function runSearchInBackground(channelQueryId: string, query: string) {
  try {
    const channels = await findChannels(query);
    await prisma.channelQuery.update({
      where: { id: channelQueryId },
      data: {
        status: "done",
        channels: {
          create: channels.map((c) => ({
            name: c.name,
            handle: c.handle,
            url: c.url,
            thumbnailUrl: c.thumbnailUrl,
            subscriberText: c.subscriberText,
            avgLengthSec: c.avgLengthSec,
            description: c.description?.slice(0, 2000),
          })),
        },
      },
    });
  } catch (err) {
    console.error(`[channel-finder] background search failed for "${query}":`, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.channelQuery
      .update({ where: { id: channelQueryId }, data: { status: "error", error: message } })
      .catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  try {
    const { query }: { query?: string } = await req.json();
    const trimmed = query?.trim();

    if (!trimmed) {
      return NextResponse.json({ error: "Please enter a request" }, { status: 400 });
    }

    // Reuse a recent identical query (finished or still running) instead of starting a
    // duplicate scrape.
    const recent = await prisma.channelQuery.findFirst({
      where: {
        query: trimmed,
        status: { in: ["pending", "done"] },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      include: { channels: true },
    });

    if (recent) {
      return NextResponse.json({ result: recent });
    }

    const created = await prisma.channelQuery.create({
      data: { query: trimmed, status: "pending" },
      include: { channels: true },
    });

    // Deliberately not awaited — the request returns immediately, the scrape keeps
    // running server-side, and the client picks up the result later via /history.
    void runSearchInBackground(created.id, trimmed);

    return NextResponse.json({ result: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[channel-finder] search failed:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
