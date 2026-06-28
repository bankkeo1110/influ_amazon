import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { getSession } from "@/lib/session";

const BASE = "https://graph.facebook.com/v19.0";

// GET /api/facebook/pages — fetch pages from FB and return them
export async function GET() {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Check token expiry
  if (user.tokenExpiry && user.tokenExpiry < new Date()) {
    return NextResponse.json({ error: "token_expired" }, { status: 401 });
  }

  const userToken = decrypt(user.accessToken);
  const params = new URLSearchParams({
    fields: "id,name,category,access_token",
    access_token: userToken,
  });

  const res = await fetch(`${BASE}/me/accounts?${params}`);
  const data = await res.json();

  if (data.error) {
    return NextResponse.json({ error: data.error.message, code: data.error.code }, { status: 400 });
  }

  return NextResponse.json({ pages: data.data ?? [] });
}

// POST /api/facebook/pages — save selected pages to DB
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { pages } = body as {
    pages: { id: string; name: string; category: string; access_token: string }[];
  };

  if (!Array.isArray(pages) || pages.length === 0) {
    return NextResponse.json({ error: "No pages provided" }, { status: 400 });
  }

  await Promise.all(
    pages.map((p) =>
      prisma.facebookPage.upsert({
        where: { pageId: p.id },
        update: {
          name: p.name,
          category: p.category,
          accessToken: encrypt(p.access_token),
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          pageId: p.id,
          name: p.name,
          category: p.category,
          accessToken: encrypt(p.access_token),
          userId: session.userId!,
        },
      })
    )
  );

  return NextResponse.json({ ok: true, saved: pages.length });
}
