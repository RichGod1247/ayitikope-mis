// prisma.config.ts
import dotenv from "dotenv";
dotenv.config({ path: "prisma/.env" });

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.cjs",
  },

  engine: "classic",

  datasource: {
    url: env("DATABASE_URL"),
  },
});
