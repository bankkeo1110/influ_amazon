import { NextResponse } from "next/server";

export async function GET() {
  const appId = process.env.FACEBOOK_APP_ID;
  const redirectUri = process.env.REDIRECT_URI;

  if (!appId || appId === "your_facebook_app_id") {
    return new NextResponse(
      `<!DOCTYPE html><html><head><title>Config error</title>
      <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#fff8f7;margin:0}
      .box{max-width:420px;padding:32px;border:1px solid #fca5a5;border-radius:12px;background:#fff}
      h2{color:#dc2626;margin:0 0 12px}p{color:#555;font-size:14px;line-height:1.6;margin:0 0 8px}
      code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:13px}</style>
      </head><body><div class="box">
      <h2>⚠️ Facebook App not configured</h2>
      <p>Set these environment variables then restart the server:</p>
      <p><code>FACEBOOK_APP_ID</code> — your numeric App ID from Meta for Developers</p>
      <p><code>FACEBOOK_APP_SECRET</code> — your App Secret</p>
      <p><code>REDIRECT_URI</code> — <code>http://localhost:3000/api/auth/facebook/callback</code></p>
      <p style="margin-top:16px;font-size:13px;color:#888">
        Create your app at <strong>developers.facebook.com</strong> → Add Product: Facebook Login + Pages API
      </p>
      <button onclick="window.close()" style="margin-top:20px;padding:8px 16px;background:#dc2626;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">Close</button>
      </div></body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 500 }
    );
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri!,
    scope: "pages_manage_posts,pages_read_engagement,pages_show_list",
    response_type: "code",
    auth_type: "rerequest",
  });

  return NextResponse.redirect(
    `https://www.facebook.com/v19.0/dialog/oauth?${params}`
  );
}
