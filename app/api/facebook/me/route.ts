import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// GET /api/facebook/me — returns current session user + their saved pages
export async function GET() {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ user: null });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      pages: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, pageId: true, name: true, category: true },
      },
    },
  });

  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      tokenExpiry: user.tokenExpiry,
      pages: user.pages,
    },
  });
}
