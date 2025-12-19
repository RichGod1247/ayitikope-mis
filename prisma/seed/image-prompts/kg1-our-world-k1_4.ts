// prisma/seed/image-prompts/kg1-our-world-k1_4.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

// Polyfill __dirname for ESM / ts-node
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function main() {
  const filePath = path.join(__dirname, "kg1-our-world-k1_4.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const data: FileShape = JSON.parse(raw);

  if (!data.imagePrompts || data.imagePrompts.length === 0) {
    console.warn("⚠️ No imagePrompts found in kg1-our-world-k1_4.json");
    return;
  }

  console.log(
    `Seeding ${data.imagePrompts.length} image prompts for ${data.subject} (${data.level}) – first strand: ${data.imagePrompts[0]?.strandCode}`,
  );

  for (const item of data.imagePrompts) {
    // Log the original codes (including nulls) for debugging
    console.log(
      `  → ${item.nodeType} | ${item.strandCode} | ${item.subStrandCode ?? "-"} | ${item.contentStandardCode ?? "-"} | ${item.indicatorCode ?? "-"} | exemplar ${item.exemplarIndex ?? "-"}`,
    );

    // Coerce nullable codes to safe defaults for Prisma types
    const strandCode = item.strandCode;
    const subStrandCode = item.subStrandCode ?? "";
    const contentStandardCode = item.contentStandardCode ?? "";
    const indicatorCode = item.indicatorCode ?? "";
    const exemplarIndex = item.exemplarIndex ?? 0;
    const ageBand = item.ageBand ?? "4–5 years";

    await prisma.imagePrompt.upsert({
      where: {
        imagePrompt_unique_node: {
          subject: data.subject,
          strandCode,
          subStrandCode,
          contentStandardCode,
          indicatorCode,
          exemplarIndex,
          nodeType: item.nodeType,
        },
      },
      update: {
        phase: data.phase,
        level: data.level,
        prompt: item.prompt,
        ageBand,
      },
      create: {
        phase: data.phase,
        level: data.level,
        subject: data.subject,
        strandCode,
        subStrandCode,
        contentStandardCode,
        indicatorCode,
        exemplarIndex,
        nodeType: item.nodeType,
        ageBand,
        prompt: item.prompt,
      },
    });
  }

  console.log("✅ Done seeding image prompts for KG1 – Our World and Our People, Strand K1.4.");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding image prompts for K1.4", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
