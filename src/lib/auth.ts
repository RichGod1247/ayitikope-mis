// src/lib/auth.ts (NextAuth v4)
import type { NextAuthOptions, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import { compare } from "bcryptjs";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;
        const user = await prisma.user.findUnique({ where: { email: creds.email } });
        if (!user || !user.passwordHash) return null;
        const ok = await compare(creds.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name || undefined } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: User | null }) {
      if (user?.id) (token as any).uid = user.id;
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if ((token as any)?.uid) (session as any).userId = (token as any).uid;
      return session;
    },
  },
};
