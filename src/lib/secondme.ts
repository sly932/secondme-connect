import logger from "./logger";

const API_BASE = "https://api.mindverse.com/gate/lab";
const OAUTH_URL = "https://go.second.me/oauth/";
const TOKEN_ENDPOINT = `${API_BASE}/api/oauth/token/code`;
const REFRESH_ENDPOINT = `${API_BASE}/api/oauth/token/refresh`;

// ============================================================
// OAuth2
// ============================================================

export function getAuthorizationUrl() {
  const clientId = process.env.SECONDME_CLIENT_ID!;
  const redirectUri = process.env.SECONDME_REDIRECT_URI!;
  const scopes = "user.info,user.info.shades,user.info.softmemory,chat";
  const url = `${OAUTH_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code`;
  return url;
}

export async function exchangeCodeForToken(code: string) {
  logger.info("Exchanging authorization code for token");
  const res = await fetch(TOKEN_ENDPOINT, {
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

  if (!res.ok) {
    logger.error("Token exchange failed", { status: res.status });
    throw new Error(`Token exchange failed: ${res.status}`);
  }

  const data = await res.json();
  logger.info("Token exchange successful", { userId: data.data?.user_id });
  return data.data; // { access_token, refresh_token, expires_in, user_id }
}

export async function refreshAccessToken(refreshToken: string) {
  logger.info("Refreshing access token");
  const res = await fetch(REFRESH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.SECONDME_CLIENT_ID!,
      client_secret: process.env.SECONDME_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) {
    logger.error("Token refresh failed", { status: res.status });
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  logger.info("Token refresh successful");
  return data.data;
}

// ============================================================
// SecondMe API 调用
// ============================================================

async function apiCall(endpoint: string, accessToken: string, options: RequestInit = {}) {
  const url = `${API_BASE}${endpoint}`;
  logger.debug("SecondMe API call", { endpoint });

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    logger.error("SecondMe API error", { endpoint, status: res.status });
    throw new Error(`SecondMe API error: ${res.status}`);
  }

  return res;
}

/** 获取用户基础信息 */
export async function getUserInfo(accessToken: string) {
  const res = await apiCall("/api/secondme/user/info", accessToken);
  const data = await res.json();
  logger.info("Fetched user info", { name: data.data?.name });
  return data.data;
}

/** 获取用户兴趣标签 (shades) */
export async function getUserShades(accessToken: string) {
  const res = await apiCall("/api/secondme/user/shades", accessToken);
  const data = await res.json();
  logger.info("Fetched user shades", { count: data.data?.length });
  return data.data;
}

/** 获取用户软记忆 (softmemory) */
export async function getUserSoftmemory(accessToken: string) {
  const res = await apiCall("/api/secondme/user/softmemory", accessToken);
  const data = await res.json();
  logger.info("Fetched user softmemory");
  return data.data;
}

/** 聊天流式接口 - 以指定分身身份对话 */
export async function chatStream(
  accessToken: string,
  targetUserId: string,
  message: string,
  systemPrompt?: string
): Promise<ReadableStream> {
  logger.info("Starting chat stream", { targetUserId, messageLength: message.length });

  const body: Record<string, string> = {
    target_user_id: targetUserId,
    message,
  };
  if (systemPrompt) body.systemPrompt = systemPrompt;

  const res = await apiCall("/api/secondme/chat/stream", accessToken, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.body) {
    throw new Error("No response body for chat stream");
  }

  return res.body;
}
