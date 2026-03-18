import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getUserInfo, getUserShades, getUserSoftmemory } from "@/lib/secondme";
import { generateEmbedding, buildProfileText } from "@/lib/embedding";
import { saveUserEmbedding } from "@/lib/vectors";
import { generateApiKey } from "@/lib/apikey";
import logger from "@/lib/logger";

const TOKEN_URL = "https://api.mindverse.com/gate/lab/api/oauth/token/code";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    logger.error("No authorization code in callback");
    return NextResponse.redirect(new URL("/?error=no_code", req.url));
  }

  try {
    // Step 1: 用 code 换 token
    logger.info("Exchanging code for token", { code: code.slice(0, 20) });

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
      logger.error("Token exchange failed", { body: JSON.stringify(tokenJson) });
      return NextResponse.redirect(new URL("/?error=token_failed", req.url));
    }

    const { accessToken, refreshToken, expiresIn } = tokenJson.data;

    // Step 2: 获取用户信息
    const userInfoRes = await fetch("https://api.mindverse.com/gate/lab/api/secondme/user/info", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userInfoJson = await userInfoRes.json();
    logger.info("User info response", { code: userInfoJson.code });

    if (userInfoJson.code !== 0 || !userInfoJson.data) {
      logger.error("User info failed", { body: JSON.stringify(userInfoJson) });
      return NextResponse.redirect(new URL("/?error=userinfo_failed", req.url));
    }

    const userInfo = userInfoJson.data;
    const secondmeId = String(userInfo.id || userInfo.user_id || userInfo.route || "");

    if (!secondmeId) {
      logger.error("No user ID in response", { data: JSON.stringify(userInfo).slice(0, 200) });
      return NextResponse.redirect(new URL("/?error=no_user_id", req.url));
    }

    // Step 3: 创建或更新用户
    let dbUser = await prisma.user.findUnique({ where: { secondmeId } });

    if (dbUser) {
      // 老用户: 更新 token
      dbUser = await prisma.user.update({
        where: { secondmeId },
        data: {
          accessToken,
          refreshToken: refreshToken || dbUser.refreshToken,
          tokenExpiry: new Date(Date.now() + (expiresIn || 7200) * 1000),
        },
      });
      logger.info("Existing user token updated", { userId: dbUser.id });
    } else {
      // 新用户: 拉取档案
      logger.info("New user registration", { secondmeId });

      const [shades, softmemory] = await Promise.all([
        getUserShades(accessToken).catch(() => null),
        getUserSoftmemory(accessToken).catch(() => null),
      ]);

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
          credits: 100,
          apiKey: generateApiKey(),
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

      logger.info("New user created", { userId: dbUser.id, credits: 100 });
    }

    // Step 4: 用 NextAuth Credentials 登录，建立 session
    await signIn("secondme", {
      userId: dbUser.id,
      redirect: false,
    });

    // 手动设置 session cookie 然后重定向
    // signIn with redirect:false 在 server-side 不直接设 cookie，
    // 所以我们用一个中间页来完成客户端登录
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return NextResponse.redirect(
      new URL(`/api/auth/complete?userId=${dbUser.id}`, baseUrl)
    );
  } catch (err) {
    logger.error("OAuth callback error", { error: (err as Error).message, stack: (err as Error).stack });
    return NextResponse.redirect(new URL("/?error=callback_failed", req.url));
  }
}
