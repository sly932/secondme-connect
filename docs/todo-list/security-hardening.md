# 安全加固计划

## 1. 应用层速率限制（Rate Limiting）

- **方案**: 内存滑动窗口限速器（单实例，无外部依赖）
- **限速维度**: 已登录按 userId，未登录按 IP
- **策略**:
  - 读操作 GET: 60 次/分钟
  - 写操作 POST/PATCH/PUT/DELETE: 20 次/分钟
- **涉及文件**:
  - `src/lib/rate-limit.ts` — 限速器核心
  - `src/lib/api-auth.ts` — 集成限速检查
- **状态**: 进行中

## 2. 重新开启 API Key 鉴权

- 取消 `api-auth.ts` 中注释的 Bearer ck- 鉴权逻辑
- API Key 用户同样受限速约束
- **状态**: 进行中

## 3. 注册域名 + 接入 Cloudflare

- 注册自定义域名
- DNS 托管到 Cloudflare（免费版）
- 开启代理模式，隐藏 Railway 真实 IP
- 获得 DDoS 防护 + WAF 基础规则 + Bot 管理
- **状态**: 待开始

## 4. Cloudflare Pro（可选）

- 高级 WAF + API 防护
- 适合流量增长后考虑
- **状态**: 待评估
