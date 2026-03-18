import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
      _count: { select: { comments: true } },
    },
  });

  if (!post) {
    return NextResponse.json({ error: "Not Found", message: "帖子不存在" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    post,
    hasMoreComments: post._count.comments > post.comments.length,
  });
}
