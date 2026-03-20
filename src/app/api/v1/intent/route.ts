import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, applyRateLimit, unauthorized, badRequest, serverError } from "@/lib/api-auth";
import { getService } from "@/lib/ai-providers";
import logger from "@/lib/logger";

const { url: LLM_URL, model: LLM_MODEL, apiKey: LLM_KEY } = getService("intentRouter");

const INTENT_KEYS = ["consult", "writing", "painting", "game", "portrait"] as const;
type IntentKey = (typeof INTENT_KEYS)[number];

interface IntentResult {
  intent: IntentKey;
  query: string;
}

const SYSTEM_PROMPT = `你是一个意图分类器。根据用户输入，判断应该路由到哪个接口。

可用接口：
- consult: 找人聊聊/咨询。用户想和 AI 分身聊天、请教问题、倾诉烦恼、寻求建议。
- writing: 写作任务。用户想让 AI 分身帮忙写文章、文案、总结、邮件等文字内容。
- painting: 绘画任务。用户想让 AI 生成图片、插画、海报、壁纸等视觉内容。
- game: 创建游戏房间。用户想玩游戏（21点、德州扑克）。不需要 query。
- portrait: 生成自画像。用户想生成/更新自己的像素风头像。不需要 query。

输出要求：
- 只输出一个 JSON 对象，不要包含任何其他文字
- 格式: {"intent": "<key>", "query": "<用户原始需求>"}
- game 和 portrait 的 query 为空字符串
- 如果无法判断，默认使用 consult`;

async function callLLM(userInput: string): Promise<IntentResult> {
  const res = await fetch(LLM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userInput },
      ],
      temperature: 0,
      max_tokens: 200,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content?.trim() || "";

  // 提取 JSON（兼容 markdown code block 包裹）
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON found in LLM response: ${content}`);

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.intent || !INTENT_KEYS.includes(parsed.intent)) {
    throw new Error(`Invalid intent: ${parsed.intent}`);
  }

  return {
    intent: parsed.intent as IntentKey,
    query: typeof parsed.query === "string" ? parsed.query : "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const rl = applyRateLimit(req, user.id);
    if (rl) return rl;

    const body = await req.json();
    const input = body.input?.trim();
    if (!input) return badRequest("请输入内容");

    // 第一次尝试
    let result: IntentResult;
    try {
      result = await callLLM(input);
    } catch (err1) {
      logger.warn("Intent recognition first attempt failed, retrying", {
        error: (err1 as Error).message,
      });
      // 重试一次
      try {
        result = await callLLM(input);
      } catch (err2) {
        logger.error("Intent recognition failed after retry", {
          error: (err2 as Error).message,
        });
        return NextResponse.json(
          { success: false, message: "应用欠费啦，请快催一下开发者缴费" },
          { status: 503 }
        );
      }
    }

    logger.info("Intent recognized", { userId: user.id, intent: result.intent, query: result.query });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error("Intent API error", { error: (err as Error).message });
    return serverError("意图识别失败");
  }
}
