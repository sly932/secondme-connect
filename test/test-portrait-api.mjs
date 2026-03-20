#!/usr/bin/env node
/**
 * 快速测试 /api/v1/portrait 接口
 * 用法: node test/test-portrait-api.mjs
 * 需要本地 dev server 在 3000 端口运行
 */

const BASE = "http://localhost:3000";

// 从数据库拿一个真实用户的 session cookie
// 或者用 API Key —— 这里先测未登录状态 + GET
async function main() {
  console.log("=== 测试 Portrait API ===\n");

  // 1. 测试未鉴权
  console.log("1. GET /api/v1/portrait (无鉴权)");
  const r1 = await fetch(`${BASE}/api/v1/portrait`);
  console.log(`   Status: ${r1.status}`);
  console.log(`   Body: ${await r1.text()}\n`);

  // 2. 如果有 cookie，测试鉴权后的请求
  const cookie = process.argv[2];
  if (!cookie) {
    console.log("提示: 传入 session cookie 可测试完整流程");
    console.log("用法: node test/test-portrait-api.mjs 'authjs.session-token=xxx'");
    return;
  }

  console.log("2. GET /api/v1/portrait (有鉴权)");
  const r2 = await fetch(`${BASE}/api/v1/portrait`, {
    headers: { Cookie: cookie },
  });
  console.log(`   Status: ${r2.status}`);
  console.log(`   Body: ${await r2.text()}\n`);

  console.log("3. POST /api/v1/portrait (生成自画像)");
  console.log("   这会调用 SecondMe + SiliconFlow，可能需要 30-60 秒...");
  const r3 = await fetch(`${BASE}/api/v1/portrait`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  console.log(`   Status: ${r3.status}`);
  const body = await r3.json();
  console.log(`   Success: ${body.success}`);
  if (body.portraitUrl) console.log(`   Portrait URL: ${body.portraitUrl}`);
  if (body.portraitPrompt) console.log(`   Prompt: ${body.portraitPrompt.slice(0, 100)}...`);
  if (body.message) console.log(`   Message: ${body.message}`);
}

main().catch(console.error);
