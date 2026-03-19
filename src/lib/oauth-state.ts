// 服务端 OAuth state 存储，解决跨 App（浏览器 → SecondMe App WebView）cookie 不共享的问题
const stateStore = new Map<string, number>();

const STATE_TTL = 10 * 60 * 1000; // 10 分钟

export function saveState(state: string) {
  stateStore.set(state, Date.now());
  // 清理过期 state
  for (const [key, timestamp] of stateStore) {
    if (Date.now() - timestamp > STATE_TTL) {
      stateStore.delete(key);
    }
  }
}

export function verifyAndConsumeState(state: string): boolean {
  const timestamp = stateStore.get(state);
  if (!timestamp) return false;
  stateStore.delete(state);
  return Date.now() - timestamp <= STATE_TTL;
}
