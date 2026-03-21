/**
 * 匹配效果评估脚本
 *
 * 针对预设的场景分身和查询用例，评估 embedding 匹配的准确性
 *
 * 用法:
 *   npx tsx scripts/eval-match.ts                   # 运行全部评估
 *   npx tsx scripts/eval-match.ts --scene keyboard   # 仅评估键盘场景
 *   npx tsx scripts/eval-match.ts --query q-kb-01    # 仅评估单个 query
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "fs";
import path from "path";

// ─── 配置 ───────────────────────────────────────────────

const aiProviders = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "src/lib/ai-providers.json"), "utf-8")
);
const EMBEDDING_URL = aiProviders.providers.SILICONFLOW_EMBEDDING_URL;
const EMBEDDING_MODEL = aiProviders.providers.SILICONFLOW_EMBEDDING_MODEL;
const EMBEDDING_API_KEY = process.env.SILICONFLOW_API_KEY;

if (!EMBEDDING_API_KEY) {
  console.error("❌ SILICONFLOW_API_KEY 未设置（请检查 .env.local）");
  process.exit(1);
}

// ─── 数据结构 ─────────────────────────────────────────────

interface Persona {
  id: string;
  name: string;
  scene: string;
  role: string;
  bio: string;
  isNpc: boolean;
  shades: { shadeName: string; shadeDescription: string }[];
  softmemory: { list: { factObject: string; factContent: string }[] };
}

interface QueryCase {
  id: string;
  scene: string;
  query: string;
  expectedMatches: string[];
  expectedRoles: string[];
  notes: string;
}

interface EmbeddedPersona extends Persona {
  profileText: string;
  embedding: number[];
}

interface MatchResult {
  personaId: string;
  name: string;
  role: string;
  similarity: number;
  isExpected: boolean;
  rank: number;
}

interface QueryResult {
  queryId: string;
  scene: string;
  query: string;
  matches: MatchResult[];
  precision: number;      // 期望分身在 top-N 中的命中率
  avgExpectedRank: number; // 期望分身的平均排名
  notes: string;
}

// ─── 工具函数 ─────────────────────────────────────────────

function buildProfileText(persona: Persona): string {
  const parts: string[] = [];

  if (persona.bio) parts.push(`简介: ${persona.bio}`);

  if (persona.shades?.length) {
    const tags = persona.shades.map((s) => s.shadeName).join(", ");
    if (tags) parts.push(`兴趣标签: ${tags}`);
  }

  if (persona.softmemory) {
    const memStr = JSON.stringify(persona.softmemory);
    if (memStr.length > 0) parts.push(`知识库: ${memStr}`);
  }

  return parts.join("\n\n");
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding API 错误 ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.data?.[0]?.embedding) {
    throw new Error(`Embedding 响应异常: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.data[0].embedding as number[];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── 主流程 ──────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const sceneFilter = args.includes("--scene") ? args[args.indexOf("--scene") + 1] : null;
  const queryFilter = args.includes("--query") ? args[args.indexOf("--query") + 1] : null;

  // 1. 加载数据
  const dataDir = path.join(process.cwd(), "data/match-eval");
  const personas: Persona[] = JSON.parse(fs.readFileSync(path.join(dataDir, "personas.json"), "utf-8"));
  const queries: QueryCase[] = JSON.parse(fs.readFileSync(path.join(dataDir, "queries.json"), "utf-8"));

  console.log(`📊 已加载 ${personas.length} 个测试分身, ${queries.length} 个查询用例\n`);

  // 2. 检查缓存：如果已有 embedding 缓存就直接加载
  const cachePath = path.join(dataDir, "embeddings-cache.json");
  let embeddedPersonas: EmbeddedPersona[];

  if (fs.existsSync(cachePath)) {
    console.log("📦 发现 embedding 缓存，直接加载...\n");
    embeddedPersonas = JSON.parse(fs.readFileSync(cachePath, "utf-8"));

    // 检查是否有新增的分身需要生成 embedding
    const cachedIds = new Set(embeddedPersonas.map((p) => p.id));
    const newPersonas = personas.filter((p) => !cachedIds.has(p.id));

    if (newPersonas.length > 0) {
      console.log(`🆕 发现 ${newPersonas.length} 个新分身，生成 embedding...\n`);
      for (const persona of newPersonas) {
        const profileText = buildProfileText(persona);
        console.log(`  🔄 [${persona.name}] (${persona.role}) — ${profileText.length} 字...`);
        const embedding = await generateEmbedding(profileText);
        console.log(`  ✅ [${persona.name}] 完成 (${embedding.length} 维)`);
        embeddedPersonas.push({ ...persona, profileText, embedding });
        await sleep(200);
      }
      fs.writeFileSync(cachePath, JSON.stringify(embeddedPersonas, null, 2));
    }
  } else {
    // 首次运行：为所有分身生成 embedding
    console.log("🔄 首次运行，为所有分身生成 embedding...\n");
    embeddedPersonas = [];

    for (const persona of personas) {
      const profileText = buildProfileText(persona);
      console.log(`  🔄 [${persona.name}] (${persona.role}) — ${profileText.length} 字...`);
      const embedding = await generateEmbedding(profileText);
      console.log(`  ✅ [${persona.name}] 完成 (${embedding.length} 维)`);
      embeddedPersonas.push({ ...persona, profileText, embedding });
      await sleep(200); // 限速
    }

    // 缓存 embedding
    fs.writeFileSync(cachePath, JSON.stringify(embeddedPersonas, null, 2));
    console.log(`\n💾 已缓存 ${embeddedPersonas.length} 个分身的 embedding\n`);
  }

  // 3. 筛选要评估的 query
  let targetQueries = queries;
  if (sceneFilter) {
    targetQueries = queries.filter((q) => q.scene === sceneFilter);
    console.log(`🎯 仅评估场景: ${sceneFilter} (${targetQueries.length} 个查询)\n`);
  }
  if (queryFilter) {
    targetQueries = queries.filter((q) => q.id === queryFilter);
    console.log(`🎯 仅评估查询: ${queryFilter}\n`);
  }

  if (targetQueries.length === 0) {
    console.error("❌ 未找到匹配的查询用例");
    process.exit(1);
  }

  // 4. 执行匹配评估
  console.log("═".repeat(80));
  console.log("  匹配效果评估");
  console.log("═".repeat(80));

  const allResults: QueryResult[] = [];

  for (const qc of targetQueries) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`📝 [${qc.id}] ${qc.scene} | ${qc.query}`);
    console.log(`   期望匹配: ${qc.expectedRoles.join(", ")}`);
    console.log(`${"─".repeat(70)}`);

    // 为同场景的分身做匹配
    const scenePersonas = embeddedPersonas.filter((p) => p.scene === qc.scene);

    // 生成 query embedding
    const queryEmbedding = await generateEmbedding(qc.query);
    await sleep(200);

    // 计算相似度并排序
    const matches: MatchResult[] = scenePersonas
      .map((p) => ({
        personaId: p.id,
        name: p.name,
        role: p.role,
        similarity: cosineSimilarity(queryEmbedding, p.embedding),
        isExpected: qc.expectedMatches.includes(p.id),
        rank: 0,
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .map((m, i) => ({ ...m, rank: i + 1 }));

    // 输出排名
    for (const m of matches) {
      const marker = m.isExpected ? "✅" : "  ";
      const pct = (m.similarity * 100).toFixed(1);
      console.log(`   ${marker} #${m.rank} ${m.name} (${m.role}) — ${pct}%`);
    }

    // 计算评估指标
    const expectedInTop = matches.filter((m) => m.isExpected);
    const topN = Math.min(qc.expectedMatches.length, scenePersonas.length);
    const topNMatches = matches.slice(0, topN);
    const precision = topNMatches.filter((m) => m.isExpected).length / topN;
    const avgExpectedRank = expectedInTop.length > 0
      ? expectedInTop.reduce((sum, m) => sum + m.rank, 0) / expectedInTop.length
      : scenePersonas.length;

    console.log(`\n   📊 Precision@${topN}: ${(precision * 100).toFixed(0)}% | 期望分身平均排名: ${avgExpectedRank.toFixed(1)}`);

    allResults.push({
      queryId: qc.id,
      scene: qc.scene,
      query: qc.query,
      matches,
      precision,
      avgExpectedRank,
      notes: qc.notes,
    });
  }

  // 5. 生成综合报告
  console.log(`\n\n${"═".repeat(80)}`);
  console.log("  综合评估报告");
  console.log(`${"═".repeat(80)}\n`);

  // 按场景分组统计
  const scenes = [...new Set(allResults.map((r) => r.scene))];
  const sceneLabels: Record<string, string> = {
    keyboard: "键盘购买",
    "open-shop": "开店咨询",
    "job-search": "求职打听",
    "study-abroad": "留学择校",
    renting: "租房搬家",
    startup: "创业找合伙人",
    medical: "医疗健康",
  };

  let totalPrecision = 0;
  let totalAvgRank = 0;
  let totalQueries = 0;

  for (const scene of scenes) {
    const sceneResults = allResults.filter((r) => r.scene === scene);
    const avgPrecision = sceneResults.reduce((s, r) => s + r.precision, 0) / sceneResults.length;
    const avgRank = sceneResults.reduce((s, r) => s + r.avgExpectedRank, 0) / sceneResults.length;

    console.log(`📂 ${sceneLabels[scene] || scene}`);
    console.log(`   查询数: ${sceneResults.length}`);
    console.log(`   平均 Precision: ${(avgPrecision * 100).toFixed(0)}%`);
    console.log(`   期望分身平均排名: ${avgRank.toFixed(2)}`);

    for (const r of sceneResults) {
      const topMatch = r.matches[0];
      const marker = r.precision >= 0.5 ? "✅" : "⚠️";
      console.log(`   ${marker} ${r.queryId}: Top1=${topMatch.name}(${(topMatch.similarity * 100).toFixed(1)}%) Precision=${(r.precision * 100).toFixed(0)}%`);
    }
    console.log();

    totalPrecision += avgPrecision * sceneResults.length;
    totalAvgRank += avgRank * sceneResults.length;
    totalQueries += sceneResults.length;
  }

  console.log(`${"─".repeat(50)}`);
  console.log(`🏆 总体评估`);
  console.log(`   总查询数: ${totalQueries}`);
  console.log(`   总平均 Precision: ${((totalPrecision / totalQueries) * 100).toFixed(0)}%`);
  console.log(`   总平均期望排名: ${(totalAvgRank / totalQueries).toFixed(2)}`);
  console.log();

  // 6. 保存报告到文件
  const report = {
    generatedAt: new Date().toISOString(),
    embeddingModel: EMBEDDING_MODEL,
    totalPersonas: embeddedPersonas.length,
    totalQueries: targetQueries.length,
    overallPrecision: totalPrecision / totalQueries,
    overallAvgExpectedRank: totalAvgRank / totalQueries,
    byScene: scenes.map((scene) => {
      const sceneResults = allResults.filter((r) => r.scene === scene);
      return {
        scene,
        label: sceneLabels[scene] || scene,
        queryCount: sceneResults.length,
        avgPrecision: sceneResults.reduce((s, r) => s + r.precision, 0) / sceneResults.length,
        avgExpectedRank: sceneResults.reduce((s, r) => s + r.avgExpectedRank, 0) / sceneResults.length,
      };
    }),
    details: allResults,
  };

  const reportPath = path.join(dataDir, "eval-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📁 报告已保存: ${reportPath}`);
}

main().catch((err) => {
  console.error("脚本异常:", err);
  process.exit(1);
});
