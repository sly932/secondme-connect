import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
  const userId = new URL(req.url).searchParams.get("userId");

  if (!userId) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, avatar: true, credits: true, apiKey: true },
    });

    if (!user) {
      return NextResponse.redirect(new URL("/?error=user_not_found", req.url));
    }

    // 直接生成 JWT token 并设置 cookie
    const token = await encode({
      token: {
        userId: user.id,
        userName: user.name,
        avatar: user.avatar,
        credits: user.credits,
        apiKey: user.apiKey,
        sub: user.id,
        name: user.name,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
      },
      secret: process.env.NEXTAUTH_SECRET!,
      salt: process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const response = NextResponse.redirect(new URL("/", baseUrl));

    // 设置 session cookie
    const cookieName = process.env.NODE_ENV === "production"
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    response.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    logger.info("Session created for user", { userId: user.id });
    return response;
  } catch (err) {
    logger.error("Complete route error", { error: (err as Error).message });
    return NextResponse.redirect(new URL("/?error=session_failed", req.url));
  }
}
