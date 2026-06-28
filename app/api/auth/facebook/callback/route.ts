import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { getSession } from "@/lib/session";

const BASE = "https://graph.facebook.com/v19.0";

function popupHtml(type: "success" | "error", payload?: string) {
  const message = type === "success"
    ? JSON.stringify({ type: "fb_auth_success" })
    : JSON.stringify({ type: "fb_auth_error", error: payload ?? "unknown" });

  return `<!DOCTYPE html>
<html>
<head><title>${type === "success" ? "Connected" : "Auth failed"}</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#EEEBE6}</style>
</head>
<body>
<p style="color:#666;font-size:14px">${type === "success" ? "Connected! Closing…" : "Auth failed. Closing…"}</p>
<script>
  try {
    if (window.opener) {
      window.opener.postMessage(${message}, window.location.origin);
      window.close();
    } else {
      window.location.href = ${type === "success" ? '"/facebook/pages"' : `"/facebook?auth_error=${encodeURIComponent(payload ?? "unknown")}"`};
    }
  } catch(e) {
    window.location.href = "/facebook";
  }
</script>
</body>
</html>`;
}

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
  const params = new URLSearchParams({ fields: "id,name,email", access_token: token });
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
    return new NextResponse(popupHtml("error", errorParam ?? "no_code"), {
      headers: { "Content-Type": "text/html" },
    });
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

    return new NextResponse(popupHtml("success"), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    console.error("[FB callback]", msg);
    return new NextResponse(popupHtml("error", msg), {
      headers: { "Content-Type": "text/html" },
    });
  }
}
