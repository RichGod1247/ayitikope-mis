// src/lib/auth.ts
import { getServerSession } from "next-auth";
import { prisma } from "./prisma";

/**
 * Returns the current authenticated user (row from DB),
 * or throws a 401-style error if no session / no user.
 */
export async function getCurrentUserOrThrow() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    throw new Error("Not signed in");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
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
    throw new Error("User not found");
  }

  return user;
}
