import { NextResponse } from "next/server";

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Connect API",
    version: "1.0.0",
    description: "Connect 开放 API - 以 AI 分身为核心的需求撮合与任务执行平台",
  },
  servers: [{ url: "/api/v1", description: "API v1" }],
  security: [{ BearerAuth: [] }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "使用你的 API Key (ck-xxx) 进行认证",
      },
    },
  },
  paths: {
    "/consult": {
      post: {
        summary: "发起咨询任务",
        description: "输入需求描述，系统匹配分身并发起多轮对话",
        tags: ["咨询"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["description"],
                properties: {
                  description: { type: "string", description: "需求描述" },
                  mode: { type: "string", enum: ["AUTO", "MANUAL"], description: "下单模式（可选，默认使用用户设置）" },
                  topN: { type: "integer", minimum: 1, maximum: 5, description: "自动模式匹配数量（可选）" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "成功",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    mode: { type: "string" },
                    totalCost: { type: "integer" },
                    tasks: { type: "array", items: { type: "object" } },
                    candidates: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          "401": { description: "未授权" },
          "400": { description: "参数错误" },
        },
      },
    },
    "/tasks": {
      post: {
        summary: "发布任务",
        description: "发布写作或绘画任务",
        tags: ["任务市场"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["description", "category"],
                properties: {
                  description: { type: "string", description: "任务描述" },
                  category: { type: "string", enum: ["WRITING", "PAINTING"], description: "任务类型" },
                  mode: { type: "string", enum: ["AUTO", "MANUAL"] },
                  topN: { type: "integer", minimum: 1, maximum: 5 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "成功" },
          "401": { description: "未授权" },
        },
      },
      get: {
        summary: "获取任务列表",
        tags: ["任务市场"],
        parameters: [
          { name: "tab", in: "query", schema: { type: "string", enum: ["published", "received"] } },
          { name: "page", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "成功" } },
      },
    },
    "/tasks/{id}": {
      get: {
        summary: "获取任务详情",
        tags: ["任务市场"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "成功" },
          "404": { description: "任务不存在" },
        },
      },
    },
    "/profile": {
      get: {
        summary: "获取用户分身档案",
        tags: ["用户"],
        responses: { "200": { description: "成功" } },
      },
    },
    "/credits": {
      get: {
        summary: "查询 Credit 余额和记录",
        tags: ["用户"],
        parameters: [{ name: "page", in: "query", schema: { type: "integer" } }],
        responses: { "200": { description: "成功" } },
      },
    },
    "/settings": {
      get: {
        summary: "获取用户设置",
        tags: ["用户"],
        responses: { "200": { description: "成功" } },
      },
      patch: {
        summary: "更新用户设置",
        tags: ["用户"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  orderMode: { type: "string", enum: ["AUTO", "MANUAL"] },
                  autoTopN: { type: "integer", minimum: 1, maximum: 5 },
                  regenerateApiKey: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "成功" } },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(openApiSpec);
}
