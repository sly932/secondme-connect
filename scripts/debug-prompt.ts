import { PrismaClient } from "@prisma/client";
import { chatStream } from "../src/lib/secondme";

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
const IDS = ["eval-edu-003", "eval-shop-001", "sim-ent-006"];

async function main() {
  for (const id of IDS) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, secondmeId: true, accessToken: true, bio: true },
    });
    if (!user) { console.log("Not found:", id); continue; }

    const profileLines: string[] = [];
    if (user.name) profileLines.push("- 姓名: " + user.name);
    if (user.bio) profileLines.push("- 简介: " + user.bio);
    const sp = "## 你的身份档案\n" + profileLines.join("\n") + "\n\n## 风格要求\n- 明亮、充满活力的色调\n- 像素风（pixel art）、16-bit 美学\n\n## 输出格式\n- 只输出英文绘画提示词本身，200 词以内";
    const msg = `你是${user.name}，请根据你对自己的认知，完成你的像素风自画像提示词。`;

    const stream = await chatStream(user.accessToken, user.secondmeId, msg, sp);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        try {
          const j = JSON.parse(line.slice(6));
          const c = j.choices?.[0]?.delta?.content;
          if (c) text += c;
        } catch {}
      }
    }

    console.log(`\n=== ${user.name} (${id}) ===`);
    console.log(text.trim());
    console.log("---");
  }
  await prisma.$disconnect();
}
main().catch(console.error);
