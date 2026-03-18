import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.SECONDME_CLIENT_ID!;
  const redirectUri = process.env.SECONDME_REDIRECT_URI!;
  const scopes = "user.info,user.info.shades,user.info.softmemory,chat";
  const state = randomBytes(24).toString("hex");

  const url = `https://go.second.me/oauth/?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}`;

  const response = NextResponse.redirect(url);
  response.cookies.set("sm-oauth-state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
