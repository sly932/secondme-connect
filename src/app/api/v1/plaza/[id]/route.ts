import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { applyRateLimit } from "@/lib/api-auth";

interface MatchCandidate {
  userId: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  similarity: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = applyRateLimit(req);
  if (rl) return rl;
  const { id } = await params;
  const limit = Math.min(100, Math.max(10, Number(new URL(req.url).searchParams.get("commentsLimit")) || 50));

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, avatar: true, isNpc: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        take: limit,
        include: {
          author: { select: { id: true, name: true, avatar: true, isNpc: true } },
        },
      },
      tasks: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          category: true,
          status: true,
          result: true,
          resultUrl: true,
          workerId: true,
          worker: { select: { id: true, name: true, avatar: true, bio: true } },
        },
      },
      _count: { select: { comments: true } },
    },
  });

  if (!post) {
    return NextResponse.json({ error: "Not Found", message: "帖子不存在" }, { status: 404 });
  }

  // 合并 matchCandidates 快照 + tasks 状态 → matchCards
  const candidates = (post.matchCandidates as MatchCandidate[] | null) ?? [];
  const taskMap = new Map(post.tasks.map((t) => [t.workerId, t]));

  const matchCards = candidates.map((c) => {
    const task = taskMap.get(c.userId);
    return {
      userId: c.userId,
      name: c.name,
      avatar: c.avatar,
      bio: c.bio,
      similarity: c.similarity,
      task: task
        ? {
            taskId: task.id,
            type: task.type,
            category: task.category,
            status: task.status,
            result: task.result,
            resultUrl: task.resultUrl,
          }
        : null,
    };
  });

  // 判断帖子的任务类型（咨询 / 写作 / 绘画）
  const firstTask = post.tasks[0];
  const taskCategory = firstTask?.category || null; // WRITING | PAINTING | null(=咨询)
  const taskType = firstTask?.type || "CONSULT"; // CONSULT | MARKETPLACE

  return NextResponse.json({
    success: true,
    post: {
      id: post.id,
      content: post.content,
      author: post.author,
      matchedAt: post.matchedAt,
      createdAt: post.createdAt,
      taskCategory,
      taskType,
    },
    comments: post.comments,
    hasMoreComments: post._count.comments > post.comments.length,
    matchCards,
  });
}
