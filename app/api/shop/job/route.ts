import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_QUERY } from "@/lib/amazonShop";
import { runDeepCrawl } from "@/lib/shopCrawler";

export const dynamic = "force-dynamic";

type Body = {
  query?: string;
  target?: number;
  maxVideoPages?: number;
};

/** GET — the newest job, so the page can resume showing progress after a reload. */
export async function GET() {
  try {
    const job = await prisma.shopCrawlJob.findFirst({ orderBy: { startedAt: "desc" } });
    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json().catch(() => ({}));
    const query = (body.query ?? "").trim() || DEFAULT_QUERY;
    const target = Math.min(5000, Math.max(1, body.target ?? 1000));
    const maxVideoPages = Math.min(50, Math.max(1, body.maxVideoPages ?? 3));

    const running = await prisma.shopCrawlJob.findFirst({ where: { status: "running" } });
    if (running) {
      return NextResponse.json(
        { error: "A crawl is already running. Stop it first.", job: running },
        { status: 409 }
      );
    }

    const job = await prisma.shopCrawlJob.create({
      data: { baseQuery: query, target, status: "running" },
    });

    // Same pattern as the channel finder: not awaited, so the request returns at
    // once and the crawl keeps running in this persistent Node process. A crawl to
    // 1000 takes hours of paced requests, far past any HTTP timeout.
    void runDeepCrawl({ jobId: job.id, baseQuery: query, target, maxVideoPages }).catch(
      async (err) => {
        console.error("[shop-crawl] deep crawl failed:", err);
        await prisma.shopCrawlJob
          .update({
            where: { id: job.id },
            data: {
              status: "error",
              error: err instanceof Error ? err.message : "Unknown error",
              finishedAt: new Date(),
            },
          })
          .catch(() => {});
      }
    );

    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE — asks the running crawl to stop; the loop checks status between queries. */
export async function DELETE() {
  try {
    const running = await prisma.shopCrawlJob.findFirst({ where: { status: "running" } });
    if (!running) return NextResponse.json({ ok: true, job: null });

    const job = await prisma.shopCrawlJob.update({
      where: { id: running.id },
      data: { status: "stopped", finishedAt: new Date() },
    });
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
