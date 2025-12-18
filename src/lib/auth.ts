// src/lib/auth.ts

import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";

/**
 * NextAuth configuration used by:
 *  - /api/auth/[...nextauth]
 *  - getServerSession(authOptions)
 *  - our helpers like getCurrentUserOrThrow
 *
 * For now we use a simple Credentials provider:
 *  - User signs in with email + password
 *  - We look up by email
 *  - If not found, we create a basic user record (dev-friendly)
 *
 * NOTE: This is intentionally simple for development.
 * In production, you MUST add proper password hashing / validation.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email) {
          return null;
        }

        const email = credentials.email.toLowerCase().trim();

        // Look for existing user
        let user = await prisma.user.findUnique({
          where: { email },
        });

        // If not found, create a very basic user (DEV-ONLY behaviour)
        if (!user) {
          user = await prisma.user.create({
            data: {
              email,
              name: email.split("@")[0] || "EduLife User",
            },
          });
        }

        // ❗ For now we do NOT validate password (dev mode).
        // Later you can:
        // - add passwordHash to User
        // - hash & compare passwords properly.
        return user;
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    /**
     * Attach the user id onto the JWT token so we can read it later
     */
    async jwt({ token, user }) {
      if (user) {
        (token as any).id = (user as any).id;
      }
      return token;
    },

    /**
     * Expose the user id on session.user.id
     */
    async session({ session, token }) {
      const s = session as any;

      if (token && "id" in token) {
        s.user = {
          ...(session.user || {}),
          id: (token as any).id,
        };
      }

      return session;
    },
  },
};

/**
 * Returns the current authenticated user (row from DB),
 * or throws an error if no valid session / user.
 */
export async function getCurrentUserOrThrow() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    const e = new Error("Not signed in");
    (e as any).status = 401;
    throw e;
  }

  const email = session.user.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      locale: true,
      timezone: true,
    },
  });

  if (!user) {
    const e = new Error("User not found");
    (e as any).status = 404;
    throw e;
  }

  return user;
}
