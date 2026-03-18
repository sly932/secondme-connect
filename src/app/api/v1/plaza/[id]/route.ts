import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, avatar: true, isNpc: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, avatar: true, isNpc: true } },
        },
      },
    },
  });

  if (!post) {
    return NextResponse.json({ error: "Not Found", message: "帖子不存在" }, { status: 404 });
  }

  return NextResponse.json({ success: true, post });
}
