// prisma/seed/image-prompts/kg1-our-world-k1_1.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

// Cast as any so TypeScript doesn't complain about prisma.imagePrompt
const prisma = new PrismaClient() as any;

type NodeType = "strand" | "subStrand" | "contentStandard" | "indicator" | "exemplar";

type ImagePromptItem = {
  nodeType: NodeType;
  strandCode: string;
  subStrandCode: string | null;
  contentStandardCode: string | null;
  indicatorCode: string | null;
  exemplarIndex: number | null;
  ageBand: string | null;
  prompt: string;
};

type FileShape = {
  phase: string;
  level: string;
  subject: string;
  imagePrompts: ImagePromptItem[];
};

/**
 * Build a stable deterministic ID for each prompt so we can upsert by `id`.
 * This makes the seed idempotent without depending on the compound unique input type.
 */
function buildStableId(data: FileShape, item: ImagePromptItem): string {
  const safe = (v: string | null) => (v ?? "none");
  const safeInt = (v: number | null) => (v == null ? "none" : String(v));

  return [
    data.phase,
    data.level,
    // Keep subject as-is; Postgres text PK can handle spaces.
    data.subject,
    item.nodeType,
    safe(item.strandCode),
    safe(item.subStrandCode),
    safe(item.contentStandardCode),
    safe(item.indicatorCode),
    safeInt(item.exemplarIndex),
  ].join("|");
}

async function main() {
  // Use process.cwd() so this works well with ts-node and ESM
  const filePath = path.join(
    process.cwd(),
    "prisma",
    "seed",
    "image-prompts",
    "kg1-our-world-k1_1.json",
  );

  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as FileShape;

  if (!data.imagePrompts || data.imagePrompts.length === 0) {
    console.log("No image prompts found in JSON – nothing to seed.");
    return;
  }

  console.log(
    `Seeding ${data.imagePrompts.length} image prompts for ${data.subject} (${data.level}) – first strand: ${data.imagePrompts[0]?.strandCode}`,
  );

  for (const item of data.imagePrompts) {
    const id = buildStableId(data, item);

    console.log(
      `  → ${item.nodeType} | ${item.strandCode} | ${item.subStrandCode ?? "-"} | ${item.contentStandardCode ?? "-"} | ${
        item.indicatorCode ?? "-"
      } | exemplar ${item.exemplarIndex ?? "-"}`,
    );

    await prisma.imagePrompt.upsert({
      where: { id }, // 🔑 Upsert by primary key
      update: {
        phase: data.phase,
        level: data.level,
        subject: data.subject,
        strandCode: item.strandCode,
        subStrandCode: item.subStrandCode,
        contentStandardCode: item.contentStandardCode,
        indicatorCode: item.indicatorCode,
        exemplarIndex: item.exemplarIndex,
        nodeType: item.nodeType,
        ageBand: item.ageBand,
        prompt: item.prompt,
      },
      create: {
        id,
        phase: data.phase,
        level: data.level,
        subject: data.subject,
        strandCode: item.strandCode,
        subStrandCode: item.subStrandCode,
        contentStandardCode: item.contentStandardCode,
        indicatorCode: item.indicatorCode,
        exemplarIndex: item.exemplarIndex,
        nodeType: item.nodeType,
        ageBand: item.ageBand,
        prompt: item.prompt,
      },
    });
  }

  console.log("✅ Done seeding image prompts for KG1 – Our World and Our People, Strand K1.1.");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding image prompts", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
