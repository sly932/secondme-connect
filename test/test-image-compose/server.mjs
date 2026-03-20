/**
 * 本地服务器 — 提供 HTML 页面 + API 代理
 *
 * 用法: node server.mjs
 * 访问: http://localhost:3456
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const PORT = 3456;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

if (!OPENROUTER_API_KEY) {
  console.error('❌ 请在 .env.local 中设置 OPENROUTER_API_KEY');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  // Serve HTML
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // API proxy
  if (req.method === 'POST' && req.url === '/api/compose') {
    let body = '';
    for await (const chunk of req) body += chunk;

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const { images, prompt, style, model } = payload;

    const SUPPORTED_MODELS = {
      'gemini': 'google/gemini-2.5-flash-image',
      'gpt5mini': 'openai/gpt-5-mini',
    };
    const modelId = SUPPORTED_MODELS[model] || SUPPORTED_MODELS['gemini'];

    if (!images?.length || !prompt) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing images or prompt' }));
      return;
    }

    console.log(`[${new Date().toLocaleTimeString()}] 生成请求: ${style} + ${modelId}, ${images.length} 张图`);

    try {
      const apiRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'http://localhost:3456',
          'X-Title': 'sm-connect image compose',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            {
              role: 'user',
              content: [...images, { type: 'text', text: prompt }],
            },
          ],
        }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error(`  ❌ API 错误 (${apiRes.status}): ${errText.slice(0, 200)}`);
        res.writeHead(apiRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: errText }));
        return;
      }

      const data = await apiRes.json();
      const content = data.choices?.[0]?.message?.content || '';

      // 尝试提取 image URL
      let imageUrl = null;
      const urlMatch = content.match(/https:\/\/[^\s)"]+\.(png|jpg|jpeg|webp|gif)/i);
      if (urlMatch) imageUrl = urlMatch[0];

      console.log(`  ✅ [${modelId}] 响应: ${content.length} 字符, 图片: ${imageUrl ? '有' : '无'}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content, imageUrl, model: modelId }));
    } catch (err) {
      console.error(`  ❌ 请求失败:`, err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🚀 服务器已启动: http://localhost:${PORT}`);
  console.log(`📦 模型: Gemini 2.5 Flash Image + GPT-5 Mini via OpenRouter`);
  console.log(`🔑 API Key: ${OPENROUTER_API_KEY.slice(0, 12)}...`);
  console.log(`\nCtrl+C 停止服务器\n`);
});
