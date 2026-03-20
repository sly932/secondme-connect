import prisma from "./prisma";
import logger from "./logger";

const SECONDME_API_BASE = process.env.SECONDME_API_BASE_URL || "https://api.mindverse.com/gate/lab";

/**
 * 用 SecondMe OAuth token 验证用户身份，并映射到本地用户
 * 返回本地用户 { id, name, credits } 或 null
 */
export async function resolveUserFromSecondMeToken(bearerToken: string) {
  try {
    // 调 SecondMe user/info 验证 token 并获取用户信息
    const res = await fetch(`${SECONDME_API_BASE}/api/secondme/user/info`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    if (!res.ok) {
      logger.warn("SecondMe token validation failed", { status: res.status });
      return null;
    }

    const result = await res.json();
    if (result.code !== 0 || !result.data) {
      logger.warn("SecondMe token response invalid", { code: result.code });
      return null;
    }

    const { route, name, avatarUrl } = result.data;
    if (!route) {
      logger.warn("SecondMe user has no route/id");
      return null;
    }

    // 在本地数据库查找或创建用户
    const user = await prisma.user.findUnique({
      where: { secondmeId: route },
      select: { id: true, name: true, credits: true },
    });

    if (user) {
      return user;
    }

    // 用户不存在，自动创建（首次通过 MCP 进来的用户）
    const newUser = await prisma.user.create({
      data: {
        secondmeId: route,
        name: name || "SecondMe User",
        avatar: avatarUrl || null,
        accessToken: bearerToken,
        refreshToken: "",
        tokenExpiry: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
      select: { id: true, name: true, credits: true },
    });

    logger.info("New user created via MCP", { userId: newUser.id, secondmeId: route });
    return newUser;
  } catch (err) {
    logger.error("MCP auth error", { error: String(err) });
    return null;
  }
}
