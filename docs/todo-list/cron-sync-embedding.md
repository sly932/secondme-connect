# Cron 定时任务：每日同步档案 + 重建 embedding

**目标**：每天自动从 SecondMe 拉取用户最新档案，检测变化后重新生成 embedding 向量。

**部署方案**：Next.js API 路由 + Railway Cron Job

## 步骤

- [ ] 新建 API 路由 `/api/cron/sync-profiles`
  - 加 `x-cron-secret` header 鉴权，防止外部调用
  - Step 1：遍历所有非 NPC 用户，用 accessToken 重新拉取 bio / shades / softmemory
  - Step 2：对比数据库中的旧值，有变化则更新字段 + 设 `embeddingDirty = true`
  - Step 3：扫描所有 `embeddingDirty = true` 的用户，重新调 embedding 接口生成向量
  - Step 4：embedding 写入后，设 `embeddingDirty = false`
- [ ] 处理 token 过期的情况（accessToken 2h 有效，需要用 refreshToken 刷新）
- [ ] Railway 配置 Cron Job 服务，每天凌晨 3 点 POST 该接口
- [ ] 设置环境变量 `CRON_SECRET`

## 已完成的前置工作

- [x] 数据库新增 `autoMemory` (Json?) 字段
- [x] 数据库新增 `embeddingDirty` (Boolean, 默认 true) 字段
- [x] 已有 `buildProfileText` 拼接逻辑（src/lib/embedding.ts）
- [x] 已有 `saveUserEmbedding` 写入逻辑（src/lib/vectors.ts）
- [x] 已有 SecondMe API 封装：getUserInfo / getUserShades / getUserSoftmemory（src/lib/secondme.ts）
