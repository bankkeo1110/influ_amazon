import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { getSession } from "@/lib/session";

const BASE = "https://graph.facebook.com/v19.0";

async function exchangeForShortLived(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID!,
    client_secret: process.env.FACEBOOK_APP_SECRET!,
    redirect_uri: process.env.REDIRECT_URI!,
    code,
  });
  const res = await fetch(`${BASE}/oauth/access_token?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.access_token;
}

async function exchangeForLongLived(shortToken: string): Promise<{ token: string; expiry: Date }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.FACEBOOK_APP_ID!,
    client_secret: process.env.FACEBOOK_APP_SECRET!,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${BASE}/oauth/access_token?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const expiresInSec = data.expires_in ?? 60 * 24 * 60 * 60;
  return {
    token: data.access_token,
    expiry: new Date(Date.now() + expiresInSec * 1000),
  };
}

async function getMe(token: string): Promise<{ id: string; name: string; email?: string }> {
  const params = new URLSearchParams({
    fields: "id,name,email",
    access_token: token,
  });
  const res = await fetch(`${BASE}/me?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");

  if (errorParam || !code) {
    return NextResponse.redirect(
      new URL(`/facebook?auth_error=${errorParam ?? "no_code"}`, req.url)
    );
  }

  try {
    const shortToken = await exchangeForShortLived(code);
    const { token: longToken, expiry } = await exchangeForLongLived(shortToken);
    const me = await getMe(longToken);

    const user = await prisma.user.upsert({
      where: { facebookId: me.id },
      update: {
        name: me.name,
        email: me.email,
        accessToken: encrypt(longToken),
        tokenExpiry: expiry,
        updatedAt: new Date(),
      },
      create: {
        facebookId: me.id,
        name: me.name,
        email: me.email,
        accessToken: encrypt(longToken),
        tokenExpiry: expiry,
      },
    });

    const session = await getSession();
    session.userId = user.id;
    session.facebookId = user.facebookId;
    session.userName = user.name ?? undefined;
    await session.save();

    return NextResponse.redirect(new URL("/facebook/pages", req.url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    console.error("[FB callback]", msg);
    return NextResponse.redirect(
      new URL(`/facebook?auth_error=${encodeURIComponent(msg)}`, req.url)
    );
  }
}
