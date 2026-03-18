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
