# 任务总览

| # | 任务 | 描述文件 | 预估时长 | 状态 |
|---|------|----------|----------|------|
| 1 | 每日 Cron 同步档案 + 重建 embedding | [cron-sync-embedding.md](cron-sync-embedding.md) | 2-3h | 进行中（同步 API + embedding 已完成，差 Cron 定时） |
| 2 | 新增模拟真实用户 NPC 档案（8 类行业，50-55 人） | [realistic-npc-profiles.md](realistic-npc-profiles.md) | 5-6h | ✅ 已完成 |
| 3 | autoMemory Skill 外部生态集成 | [auto-memory-skill.md](auto-memory-skill.md) | 3-4h | 待开始 |
| 4 | 接入 Skill，帮用户自动寻找需求的解决方案 | — | — | 还未计划 |
| 5 | 自动保存记忆和需求，增加 AddMemory API | — | — | 还未计划 |
| 6 | 安全加固：应用层限速 + API Key 鉴权 + Cloudflare | [security-hardening.md](security-hardening.md) | — | ✅ 已完成（限速 + API Key 鉴权 + SecondMe OAuth 修复） |
| 7 | 对接知乎能力，获取多方位评论和回答 | — | — | 还未计划 |
| 8 | 提升回复质量：多渠道结果聚合（知乎、LLM 等）+ 总结 | — | — | 还未计划 |
| 9 | 优化 UI + 像素场景实现度提升 | — | — | 还未计划 |
| 10 | SecondMe 接入 MCP | — | — | 还未计划 |
| 11 | SecondMe 应用商店上架 | — | — | 还未计划 |
| 12 | 增加分身肖像生成功能 + 切换肖像绘图 API | — | — | 还未计划 |
| 13 | Landing Page 新增 API Key 生成模块 | — | — | ✅ 已完成（终端风格 UI + 生成/重新生成按钮 + 多语言） |
| 14 | Landing Page Connect 按钮改为 SecondMe 登录弹窗 | — | — | ✅ 已完成（SecondMe 品牌图标 + 多语言） |
| 15 | Embedding 切换 SiliconFlow + 全量重建 | — | — | ✅ 已完成（Qwen3-Embedding-0.6B, 1024维, 145用户全部重建） |
| 16 | Navbar 同步档案按钮 | — | — | ✅ 已完成（异步调用 + spinner + toast + 速率限制） |
| 17 | SecondMe API 全面测试 + Client ID/Secret 修复 | — | — | ✅ 已完成（Token Refresh / UserInfo / Shades / Softmemory / Chat） |
