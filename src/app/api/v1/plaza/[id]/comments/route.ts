import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser, applyRateLimit, unauthorized, badRequest } from "@/lib/api-auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const rl = applyRateLimit(req, user.id);
  if (rl) return rl;

  const { id: postId } = await params;

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    return NextResponse.json({ error: "Not Found", message: "帖子不存在" }, { status: 404 });
  }

  const existing = await prisma.comment.findUnique({
    where: { postId_authorId: { postId, authorId: user.id } },
  });
  if (existing) {
    return badRequest("你已经回复过这条帖子了");
  }

  const body = await req.json();
  const content = body.content?.trim();
  if (!content) return badRequest("content 不能为空");

  const comment = await prisma.comment.create({
    data: { content, postId, authorId: user.id },
    include: {
      author: { select: { id: true, name: true, avatar: true, isNpc: true } },
    },
  });

  return NextResponse.json({ success: true, comment }, { status: 201 });
}
