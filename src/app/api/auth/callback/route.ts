import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { getSessionCookieName } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getUserShades, getUserSoftmemory } from "@/lib/secondme";
import { generateEmbedding, buildProfileText } from "@/lib/embedding";
import { saveUserEmbedding } from "@/lib/vectors";
import { createApiKeyRecord } from "@/lib/apikey";
import { claimDailyCredit } from "@/lib/credits";
import { verifyAndConsumeState } from "@/lib/oauth-state";
import logger from "@/lib/logger";

const TOKEN_URL = "https://api.mindverse.com/gate/lab/api/oauth/token/code";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    logger.error("No authorization code in callback");
    return NextResponse.redirect(new URL("/?error=no_code", baseUrl));
  }

  // 优先用服务端 state 验证（解决跨 App WebView cookie 不共享的问题）
  // 回退到 cookie 验证（兼容同浏览器内的正常流程）
  const storedState = req.cookies.get("sm-oauth-state")?.value;
  const stateValid = (state && verifyAndConsumeState(state)) || (state && storedState && state === storedState);

  if (!stateValid) {
    logger.warn("OAuth callback state mismatch", { hasState: !!state, hasStoredState: !!storedState });
    return NextResponse.redirect(new URL("/?error=invalid_state", baseUrl));
  }

  try {
    // Step 1: 用 code 换 token
    logger.info("Exchanging code for token");

    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.SECONDME_REDIRECT_URI!,
        client_id: process.env.SECONDME_CLIENT_ID!,
        client_secret: process.env.SECONDME_CLIENT_SECRET!,
      }),
    });

    const tokenJson = await tokenRes.json();
    logger.info("Token response", { code: tokenJson.code, hasData: !!tokenJson.data });

    if (tokenJson.code !== 0 || !tokenJson.data) {
      logger.error("Token exchange failed", { code: tokenJson.code });
      return NextResponse.redirect(new URL("/?error=token_failed", baseUrl));
    }

    const { accessToken, refreshToken, expiresIn } = tokenJson.data;

    // Step 2: 获取用户信息
    const userInfoRes = await fetch("https://api.mindverse.com/gate/lab/api/secondme/user/info", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userInfoJson = await userInfoRes.json();
    logger.info("User info response", { code: userInfoJson.code });

    if (userInfoJson.code !== 0 || !userInfoJson.data) {
      logger.error("User info failed", { code: userInfoJson.code });
      return NextResponse.redirect(new URL("/?error=userinfo_failed", baseUrl));
    }

    const userInfo = userInfoJson.data;
    const secondmeId = String(userInfo.id || userInfo.user_id || userInfo.route || "");

    if (!secondmeId) {
      logger.error("No user ID in response", { data: JSON.stringify(userInfo).slice(0, 200) });
      return NextResponse.redirect(new URL("/?error=no_user_id", baseUrl));
    }

    // Step 3: 创建或更新用户
    let dbUser = await prisma.user.findUnique({ where: { secondmeId } });

    if (dbUser) {
      // 老用户: 更新 token
      const tokenData = {
          accessToken,
          refreshToken: refreshToken || dbUser.refreshToken,
          tokenExpiry: new Date(Date.now() + (expiresIn || 7200) * 1000),
        };
      dbUser = await prisma.user.update({
        where: { secondmeId },
        data: tokenData,
      });
      // 同步更新绑定的 NPC
      await prisma.user.updateMany({
        where: { boundUserId: dbUser.id, isNpc: true },
        data: tokenData,
      });
      logger.info("Existing user token updated", { userId: dbUser.id });
    } else {
      // 新用户: 拉取档案
      logger.info("New user registration", { secondmeId });

      const [shades, softmemory] = await Promise.all([
        getUserShades(accessToken).catch(() => null),
        getUserSoftmemory(accessToken).catch(() => null),
      ]);

      const apiKeyRecord = createApiKeyRecord();
      dbUser = await prisma.user.create({
        data: {
          secondmeId,
          accessToken,
          refreshToken: refreshToken || "",
          tokenExpiry: new Date(Date.now() + (expiresIn || 7200) * 1000),
          name: userInfo.name || "User",
          avatar: userInfo.avatarUrl || userInfo.avatar || null,
          bio: userInfo.aboutMe || userInfo.bio || null,
          shades: shades || null,
          softmemory: softmemory || null,
          credits: 1000,
          apiKeyHash: apiKeyRecord.apiKeyHash,
          apiKeyPreview: apiKeyRecord.apiKeyPreview,
        },
      });

      // 异步生成向量
      const profileText = buildProfileText(dbUser.bio, dbUser.shades, dbUser.softmemory);
      if (profileText.length > 0) {
        generateEmbedding(profileText)
          .then((embedding) => saveUserEmbedding(dbUser!.id, embedding))
          .then(() => logger.info("User embedding created", { userId: dbUser!.id }))
          .catch((err) => logger.error("Failed to create embedding", { userId: dbUser!.id, error: err.message }));
      }

      logger.info("New user created", { userId: dbUser.id, credits: 1000 });
    }

    await claimDailyCredit(dbUser.id);

    const sessionUser = await prisma.user.findUnique({
      where: { id: dbUser.id },
      select: { id: true, name: true, avatar: true, credits: true },
    });

    if (!sessionUser) {
      throw new Error("User disappeared before session creation");
    }

    const cookieName = getSessionCookieName();
    const token = await encode({
      token: {
        userId: sessionUser.id,
        userName: sessionUser.name,
        avatar: sessionUser.avatar,
        credits: sessionUser.credits,
        sub: sessionUser.id,
        name: sessionUser.name,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      },
      secret: process.env.NEXTAUTH_SECRET!,
      salt: cookieName,
    });

    const response = NextResponse.redirect(new URL("/", baseUrl));
    response.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    response.headers.set("Cache-Control", "no-store");
    logger.info("Session created for user", { userId: sessionUser.id });
    return response;
  } catch (err) {
    logger.error("OAuth callback error", { error: (err as Error).message, stack: (err as Error).stack });
    return NextResponse.redirect(new URL("/?error=callback_failed", baseUrl));
  }
}
