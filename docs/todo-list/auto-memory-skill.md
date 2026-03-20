# autoMemory Skill 集成

**目标**：提供 Skill，让用户在 Claude Code / Open Cloud 等生态中自动上传记忆到 Connect。

## 步骤

- [ ] 设计 autoMemory 的数据结构（JSON schema）
- [ ] 新建 API 接口接收 autoMemory 上传（需 apiKey 鉴权）
- [ ] 上传后标记 `embeddingDirty = true`
- [ ] 更新 `buildProfileText` 把 autoMemory 也拼进 embedding 文本
- [ ] 编写 Skill 脚本，自动从用户对话中提取关键记忆并上传
