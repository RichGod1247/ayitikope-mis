import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type PromptRow = {
  id: string;
  phase: string;
  level: string;
  subject: string;
  strandCode: string;
  subStrandCode?: string | null;
  contentStandardCode?: string | null;
  indicatorCode?: string | null;
  exemplarIndex?: number | null;
  nodeType: string;
  ageBand: string;
  prompt: string;
};

async function main() {
  const filePath = path.join(
    process.cwd(),
    "prisma",
    "seed",
    "curriculum",
    "basic-2-science-image-prompts.json"
  );

  console.log(`📖 Loading B2 Science image prompts from: ${filePath}`);

  const raw = fs.readFileSync(filePath, "utf8");
  const rows = JSON.parse(raw) as PromptRow[];

  let upserted = 0;

  for (const r of rows) {
    await prisma.imagePrompt.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        phase: r.phase,
        level: r.level,
        subject: r.subject,
        strandCode: r.strandCode,
        subStrandCode: r.subStrandCode ?? null,
        contentStandardCode: r.contentStandardCode ?? null,
        indicatorCode: r.indicatorCode ?? null,
        exemplarIndex: r.exemplarIndex ?? null,
        nodeType: r.nodeType,
        ageBand: r.ageBand,
        prompt: r.prompt
      },
      update: {
        phase: r.phase,
        level: r.level,
        subject: r.subject,
        strandCode: r.strandCode,
        subStrandCode: r.subStrandCode ?? null,
        contentStandardCode: r.contentStandardCode ?? null,
        indicatorCode: r.indicatorCode ?? null,
        exemplarIndex: r.exemplarIndex ?? null,
        nodeType: r.nodeType,
        ageBand: r.ageBand,
        prompt: r.prompt
      }
    });

    upserted++;
  }

  console.log("✅ B2 Science ImagePrompt seeding complete.", { total: rows.length, upserted });
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
