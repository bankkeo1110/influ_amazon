import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_QUERY,
  countShopVideos,
  fetchShopName,
  mapWithConcurrency,
  searchShops,
  shopUrl,
  type SearchProvider,
} from "@/lib/amazonShop";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Storefronts crawled more recently than this are left alone unless refresh is set. */
const FRESH_FOR_MS = 24 * 60 * 60 * 1000;

const CONCURRENCY = 3;

type Body = {
  query?: string;
  maxResults?: number;
  maxVideoPages?: number;
  provider?: SearchProvider;
  refresh?: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json().catch(() => ({}));

    const query = (body.query ?? "").trim() || DEFAULT_QUERY;
    const maxResults = Math.min(200, Math.max(1, body.maxResults ?? 30));
    const maxVideoPages = Math.min(50, Math.max(1, body.maxVideoPages ?? 10));
    const refresh = body.refresh === true;

    const { provider, hits, attempts } = await searchShops(
      query,
      maxResults,
      body.provider ?? "auto"
    );

    if (hits.length === 0) {
      return NextResponse.json({
        provider,
        query,
        found: 0,
        added: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        attempts,
        warning: "The search returned no amazon.com/shop results for this query.",
      });
    }

    const existing = await prisma.amazonShop.findMany({
      where: { handle: { in: hits.map((h) => h.handle) } },
    });
    const byHandle = new Map(existing.map((row) => [row.handle, row]));

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const failures: { handle: string; error: string }[] = [];

    await mapWithConcurrency(hits, CONCURRENCY, async (hit) => {
      const prior = byHandle.get(hit.handle);
      const isFresh =
        prior && Date.now() - prior.lastCrawledAt.getTime() < FRESH_FOR_MS;

      if (prior && isFresh && !refresh) {
        skipped++;
        return;
      }

      try {
        const [name, videos] = await Promise.all([
          fetchShopName(hit.handle),
          countShopVideos(hit.handle, maxVideoPages),
        ]);

        // Fall back to the search-result title, then to the handle itself.
        const fromTitle = hit.title.replace(/[’']s Amazon Page\s*$/i, "").trim();
        const resolvedName = name || fromTitle || hit.handle;

        const data = {
          url: shopUrl(hit.handle),
          name: resolvedName,
          videoCount: videos.count,
          countCapped: videos.capped,
          sourceQuery: query,
          lastCrawledAt: new Date(),
        };

        await prisma.amazonShop.upsert({
          where: { handle: hit.handle },
          create: { handle: hit.handle, ...data },
          update: data,
        });

        if (prior) updated++;
        else added++;
      } catch (err) {
        failures.push({
          handle: hit.handle,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });

    return NextResponse.json({
      provider,
      query,
      found: hits.length,
      added,
      updated,
      skipped,
      failed: failures.length,
      failures: failures.slice(0, 10),
      attempts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
