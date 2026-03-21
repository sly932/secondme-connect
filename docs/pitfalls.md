# 易错点记录

## 1. Prisma + Supabase PgBouncer 连接池配置

**问题**: Prisma 通过 Supabase 连接池 (Transaction mode, 端口 6543) 查询时报错：
```
prepared statement "s0" already exists
```

**原因**: PgBouncer Transaction mode 不支持 prepared statements，而 Prisma 默认使用 prepared statements。

**解决方案**:

`DATABASE_URL` 必须加 `?pgbouncer=true` 参数：
```
DATABASE_URL=postgresql://postgres.<project-id>:<password>@aws-0-xxx.pooler.supabase.com:6543/postgres?pgbouncer=true
```

`DIRECT_URL` 用于 Prisma migration，走 Session mode (端口 5432)，不需要该参数：
```
DIRECT_URL=postgresql://postgres.<project-id>:<password>@aws-0-xxx.pooler.supabase.com:5432/postgres
```

**注意事项**:
- Supabase 免费版的 `db.<project-id>.supabase.co` 直连主机可能不可达，统一走 `pooler.supabase.com`
- 端口 6543 = Transaction pooler（运行时用），端口 5432 = Session pooler（migration 用）
- 主机和端口不能搭错，`db.xxx.supabase.co:6543` 不通，`pooler.supabase.com` 才有 6543 端口

**相关文件**:
- `prisma/schema.prisma` — `datasource.url` 和 `datasource.directUrl`
- `.env.local` — `DATABASE_URL` 和 `DIRECT_URL`

## 2. 本地改完 `.env.local` 后，Next dev 进程仍使用旧的 Prisma 连接

**问题**: 明明 `.env.local` 里的 `DATABASE_URL` 已经改对了，但本地接口仍然持续报错：
```text
Can't reach database server at `aws-1-us-east-2.pooler.supabase.com:6543`
```

常见触发点：
- `/api/v1/profile`
- `/api/v1/settings`
- 任何走 `prisma.user.findUnique()`、`prisma.task.findMany()` 的接口

**现象**:
- 独立脚本里直接 new `PrismaClient()` 执行 `select 1` 可以成功
- 浏览器访问本地页面或 API 仍然报数据库连接错误
- 热更新后问题不消失，像是“明明改对了配置但没生效”

**原因**:
- `next dev` 不会因为 `.env.local` 变化自动彻底重建整个运行时状态
- 项目里 `src/lib/prisma.ts` 把 Prisma Client 缓存在 `globalThis` 上，开发模式下可能继续复用旧实例
- `.next` 的 dev 缓存和旧的本地进程状态叠加后，会让应用层看起来仍在使用旧连接

**解决方案**:
1. 停掉所有本地 `next dev` 进程
2. 删除 `.next` 目录
3. 重新运行 `npm run dev`
4. 再访问相关页面或 API

可用命令：
```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill <next-dev-pid>
node -e "require('fs').rmSync('.next', { recursive: true, force: true })"
npm run dev
```

**如何快速确认不是数据库本身挂了**:
- 先测试 host/port 是否可达，例如 `aws-1-us-east-2.pooler.supabase.com:6543`
- 再用当前 `.env.local` 跑一个最小 Prisma 查询，如 `select 1 as ok`
- 如果独立 Prisma 查询成功，而本地页面仍报错，优先怀疑旧 dev 进程或 `.next` 缓存

**注意事项**:
- 只改 `.env.local` 不够，涉及数据库连接、OAuth、NextAuth 等环境变量时，默认都要重启 dev server
- 不要把这类错误第一时间归因到业务代码，先排除本地运行时状态污染

**相关文件**:
- `src/lib/prisma.ts` — Prisma Client 的全局复用
- `.env.local` — 当前本地连接串
- `.next/` — 本地开发缓存

## 3. 多台电脑协作时 Prisma schema 改了但数据库没同步

**问题**: 在 A 电脑上修改了 `prisma/schema.prisma`（新增字段、模型等），git push 后在 B 电脑 pull 了最新代码，但 API 运行时报错：
```text
PrismaClientValidationError: Invalid `prisma.xxx.findUnique()` invocation
```
或：
```text
The column `xxx.newField` does not exist in the current database.
```

**原因**:
- `git push` 只推送了代码（包括 `schema.prisma` 的改动），但不会同步远程数据库结构
- `prisma generate` 只根据 schema 文件重新生成本地 Prisma Client，也不会改数据库
- 只有 `prisma db push` 或 `prisma migrate deploy` 才会把 schema 变更应用到远程数据库
- 如果 A 电脑改了 schema 却没执行 `prisma db push`，那远程数据库就一直缺少这些字段

**解决方案**:

在任意一台电脑上执行：
```bash
npx prisma db push
```

**正确的多机协作流程**:
1. A 电脑：修改 `schema.prisma` → `npx prisma db push` → `git push`
2. B 电脑：`git pull` → `npx prisma generate`（`db push` 已在 A 执行过，无需重复）

**注意事项**:
- 改完 schema 后，**必须先 `prisma db push` 再 git push**，否则其他人 pull 代码后必然报错
- 如果不确定数据库是否和 schema 同步，跑一次 `prisma db push` 是安全的——没有差异时它不会做任何改动
- `prisma generate` ≠ `prisma db push`：前者更新本地 Client 代码，后者更新远程数据库结构

**相关文件**:
- `prisma/schema.prisma` — 数据模型定义
- `.env.local` — `DATABASE_URL` 和 `DIRECT_URL`

## 4. API 速率限制（Rate Limiting）策略

**背景**: 应用部署在 Railway（单实例），需要防止恶意用户通过 cookie 或 API Key 刷接口，尤其是会调用外部 API（SecondMe、SiliconFlow）的高成本接口。

**方案**: 内存滑动窗口限速器，按 userId（已登录）或 IP（未登录）维度限速。

**三档限速策略**:

| 档位 | 窗口 | 上限 | 适用接口 |
|------|------|------|----------|
| read | 1 分钟 | 60 次 | 所有 GET 请求 |
| write | 1 分钟 | 20 次 | 普通 POST/PATCH（评论、设置等） |
| heavy | 1 分钟 | 5 次 | 高成本接口：`POST /consult`、`POST /tasks`、`POST /plaza` |
| gameCreate | 1 分钟 | 2 次 | `POST /games/rooms`（单次触发大量 AI 多轮对话） |

**为什么高成本接口要单独限速**:
- `POST /consult` — 每次调用 SecondMe API × topN 次
- `POST /tasks` (PAINTING) — 调用 SiliconFlow 生图 API
- `POST /tasks` (WRITING) — 调用 SecondMe API
- `POST /plaza` — 向量匹配 + 自动咨询 × N
- `POST /games/rooms` — 多轮 AI 对话 × 玩家数 × 局数，单次请求可能触发几十次外部 API 调用

如果这些接口和普通写操作共享 20 次/分钟的限额，一个恶意用户可以在 1 分钟内创建 20 个游戏房间，导致服务器同时发起数百次 AI 调用。

**实现细节**:
- 不同接口使用 `routeKey` 参数隔离限速桶（如 `user:xxx:consult` 和 `user:xxx:tasks` 独立计数）
- 高成本接口的限速**叠加**在通用写限速之上，不会替代它
- 超限时返回 `429 Too Many Requests` + `Retry-After` 头
- 正常用户页面操作频率约 3-5 次/分钟（写），不会触发任何档位

**注意事项**:
- 内存限速器仅适用于单实例部署，多实例需切换到 Redis/Upstash
- Railway 默认单实例，当前方案够用
- 上线前建议接入 Cloudflare（免费版），在基础设施层防 DDoS

**相关文件**:
- `src/lib/rate-limit.ts` — 限速器核心逻辑
- `src/lib/api-auth.ts` — `applyRateLimit()` 集成函数
- `docs/todo-list/security-hardening.md` — 安全加固完整计划

## 5. 前端"保存图片"功能的连环坑（DOM 截图 + 跨域图片）

**场景**: 分享卡片包含外部图片（SecondMe 头像 `object.me.bot`、SiliconFlow 生图结果 `s3.siliconflow.cn`、Supabase 自画像），点击"保存图片"需要将整个卡片截图为 PNG 下载。

### 坑 1: html2canvas 不支持现代 CSS 颜色函数

**问题**: 使用 `html2canvas` 截图时报错：
```
Attempting to parse an unsupported color function "lab"
```

**原因**: Tailwind CSS v4 默认使用 `oklch()` / `lab()` 等现代颜色函数，而 `html2canvas` 自己解析 CSS，不支持这些新函数，直接崩溃。

**尝试过的无效方案**:
- 设置 `el.style.colorScheme = "light"` — 不能阻止 Tailwind 输出 `lab()` 颜色
- `ignoreElements: (el) => el.tagName === "STYLE"` — 颜色来源不只是 `<style>` 标签

**最终方案**: 替换为 `html-to-image`，它使用 SVG `foreignObject` 让浏览器原生渲染，不自己解析 CSS，因此不存在颜色函数兼容问题。

### 坑 2: html-to-image 跨域图片 CORS 失败

**问题**: 换用 `html-to-image` 后，截图仍失败，错误为空对象 `{}`：
```
Save share card failed: {}
```

**原因**: `html-to-image` 内部会 `fetch` 所有 `<img>` 的 src 并转为内联 data URL，但外部图片服务器没有返回 `Access-Control-Allow-Origin` 头，浏览器拦截了请求：
```
Access to fetch at 'https://object.me.bot/...' from origin 'https://a2aconnect.online'
has been blocked by CORS policy
```

涉及的外部域名：
- `object.me.bot` — SecondMe 用户头像
- `s3.siliconflow.cn` — SiliconFlow 生图结果（带签名的临时 URL）
- Supabase Storage — 自画像（这个其实有 CORS，但其他两个没有）

**尝试过的无效方案**:
- 截图前直接 `fetch(img.src)` 转 data URL — 同样被 CORS 拦截，因为 fetch 也受同源策略限制
- 在 `<img>` 上设置 `crossOrigin="anonymous"` — 需要服务器配合返回 CORS 头，我们控制不了第三方服务器

### 坑 3: 移动端 `<a download>` 不触发下载

**问题**: 桌面浏览器正常，但 iOS Safari / 微信内置浏览器中点击"保存图片"无反应。

**原因**: 移动端浏览器对程序化创建的 `<a>` 元素 `.click()` 下载行为支持不一致，特别是 iOS Safari 基本不支持。

**记录**: 曾尝试用 Web Share API 替代，但按钮文案是"保存图片"不是"分享"，用户体验不一致（会弹出系统分享面板而非直接下载）。目前桌面端走 `<a download>` 可以工作，移动端待后续优化。

### 最终方案：服务端图片代理

**核心思路**: 浏览器不能直接 fetch 跨域图片，但服务端没有 CORS 限制。

**实现**:
1. 新增 `GET /api/v1/proxy-image?url=xxx` — 服务端下载外部图片并返回
2. `saveShareImage()` 截图前，遍历卡片内所有 `<img>`，通过代理接口下载并转为 base64 data URL
3. 所有图片变成内联 base64 后，`html-to-image` 的 `toPng()` 正常截图
4. 截图完成后恢复原始 src，不影响页面显示

**文件清单**:
- `src/app/api/v1/proxy-image/route.ts` — 图片代理接口
- `src/lib/save-share-image.ts` — 截图 + 下载工具函数
- `src/components/FeedItem.tsx` — 动态分享卡片
- `src/components/Navbar.tsx` — 自画像分享卡片

**教训总结**:
- **不要用 `html2canvas`**: 它自己解析 CSS，跟不上浏览器的新特性（`lab()`, `oklch()` 等），Tailwind v4 项目基本不可用
- **跨域图片问题没有纯前端方案**: 只要图片服务器不配合返回 CORS 头，前端无论用 fetch、canvas 还是 img.crossOrigin 都绕不过去，必须走服务端代理
- **截图库选型**: `html-to-image` 优于 `html2canvas`，因为它利用浏览器原生渲染（SVG foreignObject），但仍需配合服务端代理解决跨域图片
