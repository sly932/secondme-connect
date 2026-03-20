/**
 * 插入新 NPC + 重新分配所有 NPC 绑定的真实用户
 * 运行方式: npx tsx scripts/seed-npcs.ts
 */
import prisma from "../src/lib/prisma";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(__dirname, "../data/simulated-users");

interface SimUser {
  id: string;
  name: string;
  bio: string;
  isNpc: boolean;
  shades: unknown;
  softmemory: unknown;
}

async function main() {
  // 1. 读取所有 JSON 文件
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const newNpcs: SimUser[] = [];
  for (const file of files) {
    const data: SimUser[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8"));
    newNpcs.push(...data);
  }
  console.log(`读取到 ${newNpcs.length} 个新 NPC 档案（来自 ${files.length} 个文件）`);

  // 2. 获取所有真实用户（用于绑定）
  const realUsers = await prisma.user.findMany({
    where: { isNpc: false },
    select: { id: true, name: true, accessToken: true, refreshToken: true, tokenExpiry: true },
    orderBy: { id: "asc" },
  });
  console.log(`找到 ${realUsers.length} 个真实用户`);

  if (realUsers.length === 0) {
    console.error("没有真实用户，无法绑定 NPC");
    process.exit(1);
  }

  // 3. 插入新 NPC（跳过已存在的）
  let insertCount = 0;
  let skipCount = 0;
  for (const npc of newNpcs) {
    const existing = await prisma.user.findUnique({ where: { id: npc.id } });
    if (existing) {
      skipCount++;
      continue;
    }

    // 轮询分配真实用户（先用临时的，后面统一重分配）
    const boundUser = realUsers[0];
    await prisma.user.create({
      data: {
        id: npc.id,
        secondmeId: npc.id,
        name: npc.name,
        bio: npc.bio,
        shades: npc.shades as any,
        softmemory: npc.softmemory as any,
        isNpc: true,
        autoJoinGame: true,
        credits: 200000,
        accessToken: boundUser.accessToken,
        refreshToken: boundUser.refreshToken,
        tokenExpiry: boundUser.tokenExpiry,
        boundUserId: boundUser.id,
      },
    });
    insertCount++;
  }
  console.log(`新增 ${insertCount} 个 NPC，跳过 ${skipCount} 个已存在`);

  // 4. 重新分配所有 NPC 的绑定（均匀轮询）
  const allNpcs = await prisma.user.findMany({
    where: { isNpc: true },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  console.log(`\n开始重新分配 ${allNpcs.length} 个 NPC 到 ${realUsers.length} 个真实用户...`);

  const distribution: Record<string, string[]> = {};
  for (const ru of realUsers) distribution[ru.id] = [];

  for (let i = 0; i < allNpcs.length; i++) {
    const npc = allNpcs[i];
    const boundUser = realUsers[i % realUsers.length];
    distribution[boundUser.id].push(npc.name);

    await prisma.user.update({
      where: { id: npc.id },
      data: {
        boundUserId: boundUser.id,
        accessToken: boundUser.accessToken,
        refreshToken: boundUser.refreshToken,
        tokenExpiry: boundUser.tokenExpiry,
      },
    });
  }

  // 5. 输出分配结果
  console.log("\n=== NPC 绑定分配结果 ===");
  for (const ru of realUsers) {
    const npcs = distribution[ru.id];
    console.log(`${ru.name} (${ru.id.slice(0, 10)}...): ${npcs.length} 个 NPC`);
  }

  const total = allNpcs.length;
  const perUser = Math.floor(total / realUsers.length);
  const remainder = total % realUsers.length;
  console.log(`\n总计: ${total} 个 NPC, 每人 ${perUser}${remainder > 0 ? `~${perUser + 1}` : ""} 个`);
}

main()
  .then(() => {
    console.log("\n完成!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("执行出错:", err);
    process.exit(1);
  });
