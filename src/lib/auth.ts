import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import prisma from "./prisma";
import logger from "./logger";
import { claimDailyCredit } from "./credits";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      avatar?: string;
      credits: number;
    };
  }
}

export function getSessionCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      id: "secondme",
      name: "SecondMe",
      credentials: {
        userId: { type: "text" },
      },
      async authorize(credentials) {
        // 由自定义 callback route 调用，此时用户已在数据库中
        const userId = credentials?.userId as string;
        if (!userId) return null;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, avatar: true, credits: true },
        });

        if (!user) return null;

        logger.info("Credentials authorize", { userId: user.id });
        return {
          id: user.id,
          name: user.name,
          image: user.avatar,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // 登录时尝试领取每日 credit
        await claimDailyCredit(user.id!);

        // 登录时从数据库获取完整信息（领取后的最新余额）
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id! },
          select: { id: true, name: true, avatar: true, credits: true },
        });
        if (dbUser) {
          token.userId = dbUser.id;
          token.userName = dbUser.name;
          token.avatar = dbUser.avatar;
          token.credits = dbUser.credits;
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.name = token.userName as string;
      session.user.avatar = token.avatar as string;
      session.user.credits = token.credits as number;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
