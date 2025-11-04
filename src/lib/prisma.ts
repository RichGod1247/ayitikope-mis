// src/lib/prisma.ts
import "dotenv/config"; // ensure .env is read in Node runtime
import { PrismaClient } from "@prisma/client";

// Resolve DB URL robustly
const resolvedDbUrl =
  process.env.DATABASE_URL ??
  (typeof process !== "undefined" && require("dotenv").config().parsed?.DATABASE_URL) ??
  "";

// One-time sanity print (masked)
if (process.env.NODE_ENV !== "production") {
  const masked = resolvedDbUrl.replace(/:[^:@/]+@/, "://*****@");
  console.log("DATABASE_URL at runtime:", masked || "(EMPTY)");
}

// Hard fail early if missing
if (!resolvedDbUrl) {
  throw new Error(
    "DATABASE_URL is empty at runtime. Ensure it is set in .env (and not overridden in .env.local), " +
    "or export it in the shell before starting dev. Example (PowerShell): " +
    "$env:DATABASE_URL='postgresql://...:6543/postgres?schema=edulife_os&pgbouncer=true&connection_limit=1&sslmode=require'"
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: resolvedDbUrl } }, // <- explicit URL
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
