/**
 * 内存滑动窗口限速器
 * 适用于单实例部署（Railway 默认单实例）
 * 后续如需多实例，可替换存储层为 Redis/Upstash
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export type { RateLimitConfig };

export const RATE_LIMITS = {
  read: { windowMs: 60_000, maxRequests: 60 } as RateLimitConfig,
  write: { windowMs: 60_000, maxRequests: 20 } as RateLimitConfig,
  // 高成本接口专用限速
  heavy: { windowMs: 60_000, maxRequests: 5 } as RateLimitConfig,
  gameCreate: { windowMs: 60_000, maxRequests: 2 } as RateLimitConfig,
};

const store = new Map<string, RateLimitEntry>();

// 每 5 分钟清理过期条目，防止内存泄漏
const CLEANUP_INTERVAL = 5 * 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  const maxWindow = Math.max(RATE_LIMITS.read.windowMs, RATE_LIMITS.write.windowMs);
  for (const [key, entry] of store) {
    // 移除最后一个请求已超出最大窗口的条目
    if (entry.timestamps.length === 0 || now - entry.timestamps[entry.timestamps.length - 1] > maxWindow) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * 检查某个 key 是否超出限速
 * @param key 限速维度标识（如 userId 或 IP）
 * @param config 限速配置
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  cleanup();

  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // 滑动窗口：只保留窗口内的时间戳
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= config.maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const resetMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(0, resetMs),
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    resetMs: config.windowMs,
  };
}

/**
 * 根据 HTTP 方法获取对应限速配置
 */
export function getRateLimitConfig(method: string): RateLimitConfig {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return RATE_LIMITS.read;
  }
  return RATE_LIMITS.write;
}
