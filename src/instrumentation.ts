export async function register() {
  const proxyUrl = process.env.NEXT_FETCH_PROXY;
  if (process.env.NEXT_RUNTIME === "nodejs" && proxyUrl) {
    const { setGlobalDispatcher, ProxyAgent } = await import("undici");
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    console.log(`[proxy] 全局代理已启用: ${proxyUrl}`);
  }
}
