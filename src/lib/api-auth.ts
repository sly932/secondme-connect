import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "./apikey";
import { auth } from "./auth";
import logger from "./logger";
import { checkRateLimit, getRateLimitConfig, type RateLimitConfig } from "./rate-limit";

/**
 * API 路由鉴权中间件
 * 支持两种方式:
 * 1. Session (网页登录用户)
 * 2. API Key (开放 API 调用)
 */
export async function getAuthUser(req: NextRequest) {
  // 1. API Key 鉴权
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ck-")) {
    const apiKey = authHeader.slice(7);
    const user = await validateApiKey(apiKey);
    if (!user) {
      logger.warn("API key auth failed", { keyPrefix: apiKey.slice(0, 8) });
      return null;
    }
    logger.debug("API key auth successful", { userId: user.id });
    return user;
  }

  // 2. 回退到 session
  const session = await auth();
  if (session?.user?.id) {
    logger.debug("Session auth successful", { userId: session.user.id });
    return {
      id: session.user.id,
      name: session.user.name,
      credits: session.user.credits,
    };
  }

  return null;
}

/**
 * 速率限制检查
 * 返回 NextResponse（被限速时）或 null（通过）
 */
export function applyRateLimit(req: NextRequest, userId?: string, customConfig?: RateLimitConfig, routeKey?: string): NextResponse | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const base = userId ? `user:${userId}` : `ip:${ip}`;
  const key = routeKey ? `${base}:${routeKey}` : base;
  const config = customConfig || getRateLimitConfig(req.method);
  const result = checkRateLimit(key, config);

  if (!result.allowed) {
    logger.warn("Rate limit exceeded", { key, method: req.method, resetMs: result.resetMs });
    return NextResponse.json(
      { error: "Too Many Requests", message: "请求过于频繁，请稍后再试" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(result.resetMs / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  return null;
}

export function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized", message: "请提供有效的 API Key 或登录" },
    { status: 401 }
  );
}

export function badRequest(message: string) {
  return NextResponse.json({ error: "Bad Request", message }, { status: 400 });
}

export function serverError(message: string) {
  return NextResponse.json({ error: "Internal Server Error", message }, { status: 500 });
}
