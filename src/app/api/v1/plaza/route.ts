import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 10));
  const search = searchParams.get("search")?.trim();

  const where = search ? { content: { contains: search, mode: "insensitive" as const } } : {};

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        author: { select: { id: true, name: true, avatar: true, isNpc: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.post.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    posts: posts.map((p) => ({
      id: p.id,
      content: p.content,
      author: p.author,
      commentCount: p._count.comments,
      createdAt: p.createdAt,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const content = body.content?.trim();
  if (!content) return badRequest("content 不能为空");

  const post = await prisma.post.create({
    data: { content, authorId: user.id },
    include: {
      author: { select: { id: true, name: true, avatar: true, isNpc: true } },
    },
  });

  return NextResponse.json({ success: true, post }, { status: 201 });
}
