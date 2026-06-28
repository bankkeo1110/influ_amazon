import { NextResponse } from "next/server";

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID!,
    redirect_uri: process.env.REDIRECT_URI!,
    scope: "pages_manage_posts,pages_read_engagement,pages_show_list",
    response_type: "code",
    auth_type: "rerequest",
  });

  return NextResponse.redirect(
    `https://www.facebook.com/v19.0/dialog/oauth?${params}`
  );
}
