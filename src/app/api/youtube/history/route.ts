import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const searches = await prisma.productSearch.findMany({
      orderBy: { createdAt: "desc" },
      include: { videos: true },
    });
    return NextResponse.json({ searches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await prisma.youtubeVideo.deleteMany();
    await prisma.productSearch.deleteMany();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
