import { NextRequest, NextResponse } from "next/server";
import { fetchTranscriptEvents } from "@/lib/youtubeTranscript";

const PRICE_PATTERNS = [
  /\$\d+/,
  /\d+\s*dollars?/i,
  /\d+\s*bucks?/i,
  /\bprice[sd]?\b/i,
  /\bcosts?\b/i,
  /\bworth\b/i,
  /\baffordable\b/i,
  /\bexpensive\b/i,
  /\bcheap\b/i,
  /\bon sale\b/i,
  /\bdeals?\b/i,
  /\bmsrp\b/i,
  /\bdiscounted?\b/i,
];

const PERSONAL_PATTERNS = [
  /my name is/i,
  /i('m| am) from/i,
  /i live in/i,
  /my (wife|husband|kids?|children|family|son|daughter|girlfriend|boyfriend)/i,
  /\bpersonally\b/i,
  /in my (personal )?opinion/i,
  /i (work|worked) (as|for|at)/i,
  /\bmy job\b/i,
  /\bmy house\b/i,
  /\bmy home\b/i,
  /my channel/i,
];

const SUBSCRIBE_PATTERNS = [
  /subscri/i,
  /like (this |the )?video/i,
  /hit the like/i,
  /smash (the )?like/i,
  /notification bell/i,
  /bell icon/i,
  /comment below/i,
  /leave a comment/i,
  /share this/i,
  /\bthumbs? up\b/i,
  /click like/i,
  /don't forget to/i,
  /ring the bell/i,
  /click the bell/i,
  /drop a like/i,
  /leave a like/i,
];

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  try {
    const result = await fetchTranscriptEvents(videoId);

    if (!result.ok) {
      if (result.reason === "no_captions") {
        return NextResponse.json({ error: "No transcript available" }, { status: 404 });
      }
      if (result.reason === "blocked") {
        return NextResponse.json(
          { error: "YouTube is blocking automated requests right now, try again later" },
          { status: 502 }
        );
      }
      console.error(`[transcript] upstream_error for ${videoId}, status=${result.status}`);
      return NextResponse.json(
        { error: "Transcript temporarily unavailable, try again" },
        { status: 502 }
      );
    }

    const events = result.events;

    const segments = events
      .filter((e) => e.segs && e.segs.length > 0)
      .map((e) => {
        const text = e
          .segs!.map((s) => s.utf8)
          .join("")
          .replace(/\n/g, " ")
          .trim();

        const categories: string[] = [];
        if (PRICE_PATTERNS.some((p) => p.test(text))) categories.push("price");
        if (PERSONAL_PATTERNS.some((p) => p.test(text))) categories.push("personal");
        if (SUBSCRIBE_PATTERNS.some((p) => p.test(text))) categories.push("subscribe");

        return { text, startMs: e.tStartMs, startFormatted: formatTimestamp(e.tStartMs), categories };
      })
      .filter((s) => s.text);

    const priceSegs = segments.filter((s) => s.categories.includes("price"));
    const personalSegs = segments.filter((s) => s.categories.includes("personal"));
    const subscribeSegs = segments.filter((s) => s.categories.includes("subscribe"));

    const summary = {
      price: priceSegs.length ? { count: priceSegs.length, firstAt: priceSegs[0].startFormatted } : null,
      personal: personalSegs.length ? { count: personalSegs.length, firstAt: personalSegs[0].startFormatted } : null,
      subscribe: subscribeSegs.length ? { count: subscribeSegs.length, firstAt: subscribeSegs[0].startFormatted } : null,
    };

    return NextResponse.json({ segments, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[transcript] unhandled error for ${videoId}: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
