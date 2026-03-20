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
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const PORT = 3456;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7897';
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

if (!OPENROUTER_API_KEY) {
  console.error('❌ 请在 .env.local 中设置 OPENROUTER_API_KEY');
  process.exit(1);
}

// 日志目录
const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function saveLog(style, model, request, response, error) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${ts}_${style}_${model}.json`;
  const logData = {
    timestamp: new Date().toISOString(),
    style,
    model,
    request: {
      ...request,
      // 截断 base64 避免日志文件过大
      messages: request.messages.map(m => ({
        ...m,
        content: Array.isArray(m.content)
          ? m.content.map(c => {
              if (c.type === 'image_url') {
                const url = c.image_url?.url || '';
                const header = url.slice(0, url.indexOf(',') + 1);
                return { ...c, image_url: { url: header + `<<BASE64_${Math.round((url.length - header.length) / 1024)}KB>>` } };
              }
              return c;
            })
          : m.content,
      })),
    },
    response: response
      ? JSON.parse(JSON.stringify(response, (k, v) => {
          // 截断响应中的 base64 图片，但保存前 100 字符便于识别
          if (typeof v === 'string' && v.startsWith('data:image')) {
            return v.slice(0, 100) + `...<<BASE64_${Math.round(v.length / 1024)}KB>>`;
          }
          return v;
        }))
      : null,
    error: error || null,
  };
  const filepath = path.join(LOG_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(logData, null, 2));
  console.log(`  💾 日志已保存: logs/${filename}`);
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
      'gpt5': 'openai/gpt-5-image-mini',
    };
    const modelId = SUPPORTED_MODELS[model] || SUPPORTED_MODELS['gemini'];

    if (!images?.length || !prompt) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing images or prompt' }));
      return;
    }

    console.log(`[${new Date().toLocaleTimeString()}] 生成请求: ${style} + ${modelId}, ${images.length} 张图`);

    const requestBody = {
      model: modelId,
      messages: [
        {
          role: 'user',
          content: [...images, { type: 'text', text: prompt }],
        },
      ],
    };

    try {
      const apiRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        agent: proxyAgent,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'http://localhost:3456',
          'X-Title': 'sm-connect image compose',
        },
        body: JSON.stringify(requestBody),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error(`  ❌ API 错误 (${apiRes.status}): ${errText.slice(0, 200)}`);
        saveLog(style, model, requestBody, null, `HTTP ${apiRes.status}: ${errText.slice(0, 500)}`);
        res.writeHead(apiRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: errText }));
        return;
      }

      const data = await apiRes.json();

      // 调试：打印完整响应结构（截断 base64）
      const debugStr = JSON.stringify(data, (k, v) => {
        if (typeof v === 'string' && v.length > 200) return v.slice(0, 200) + `...(${v.length} chars)`;
        return v;
      }, 2);
      console.log(`  📋 响应结构:\n${debugStr.slice(0, 2000)}`);

      const msg = data.choices?.[0]?.message;
      let content = '';
      let imageUrl = null;

      // 1) 文本内容
      if (typeof msg?.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg?.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') content += part.text;
          if (part.type === 'image_url') imageUrl = part.image_url?.url;
        }
      }

      // 2) images 数组 — OpenRouter 统一格式: message.images[].image_url.url
      if (!imageUrl && Array.isArray(msg?.images)) {
        for (const img of msg.images) {
          if (img.type === 'image_url' && img.image_url?.url) {
            imageUrl = img.image_url.url;
            break;
          }
        }
      }

      // 3) fallback: 从文本提取 URL
      if (!imageUrl && content) {
        const urlMatch = content.match(/https:\/\/[^\s)"]+\.(png|jpg|jpeg|webp|gif)/i);
        if (urlMatch) imageUrl = urlMatch[0];
      }

      console.log(`  ✅ [${modelId}] 内容: ${content.length} 字符, 图片: ${imageUrl ? '有(' + imageUrl.slice(0, 50) + '...)' : '无'}`);

      saveLog(style, model, requestBody, data, null);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content, imageUrl, model: modelId }));
    } catch (err) {
      console.error(`  ❌ 请求失败:`, err.message);
      saveLog(style, model, requestBody, null, err.message);
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
  console.log(`📦 模型: Gemini 2.5 Flash / Gemini 3.1 Flash / GPT-5 Image Mini`);
  console.log(`🔑 API Key: ${OPENROUTER_API_KEY.slice(0, 12)}...`);
  console.log(`🌐 代理: ${PROXY_URL}`);
  console.log(`\nCtrl+C 停止服务器\n`);
});
