import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseProxies } from "@/lib/amazonShop";

export const dynamic = "force-dynamic";

const SETTINGS_ID = "default";

/**
 * The proxy list the Shop crawler rotates through when Amazon starts throttling.
 * Stored as raw text so the textarea round-trips exactly what was typed,
 * comments and all.
 */
export async function GET() {
  try {
    const row = await prisma.crawlSetting.findUnique({ where: { id: SETTINGS_ID } });
    const proxies = row?.proxies ?? "";
    return NextResponse.json({ proxies, valid: parseProxies(proxies).length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { proxies }: { proxies?: string } = await req.json().catch(() => ({}));
    const text = typeof proxies === "string" ? proxies : "";

    await prisma.crawlSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, proxies: text },
      update: { proxies: text },
    });

    // Report how many lines actually parsed, so a typo is visible immediately
    // rather than at the next throttle.
    const parsed = parseProxies(text);
    return NextResponse.json({
      ok: true,
      valid: parsed.length,
      labels: parsed.map((p) => p.label),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
