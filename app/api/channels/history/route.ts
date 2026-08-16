import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const queries = await prisma.channelQuery.findMany({
      orderBy: { createdAt: "desc" },
      include: { channels: true },
    });
    return NextResponse.json({ queries });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await prisma.channel.deleteMany();
    await prisma.channelQuery.deleteMany();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
