// prisma/seed/basic-1-mathematics-image-prompts.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SUBJECT_SLUG = "basic-1-mathematics";
const PROMPTS_JSON_FILE = "basic-1-mathematics-image-prompts.master.json";

type PromptItem = {
  phase: string;
  level: string;
  subject: string;
  strandCode: string;
  subStrandCode?: string | null;
  contentStandardCode?: string | null;
  indicatorCode?: string | null;
  exemplarIndex?: number | null;
  nodeType: "subject" | "strand" | "subStrand" | "contentStandard" | "indicator" | "exemplar";
  ageBand: string;
  prompt: string;

  // Optional helper fields (ignored by DB write)
  outputImagePath?: string;
  altText?: string;
  detailedDescription?: string;
  tags?: string;
  pageNumberInPdf?: number;
};

const CHECK_MODE = process.argv.includes("--check");

// ESM-friendly __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getSeedPath(fileName: string) {
  // Expect file in: prisma/seed/curriculum/<fileName>
  return path.join(__dirname, "curriculum", fileName);
}

async function main() {
  const filePath = getSeedPath(PROMPTS_JSON_FILE);
  console.log(`📦 Loading prompts JSON from: ${filePath}`);

  const raw = fs.readFileSync(filePath, "utf8");
  const items = JSON.parse(raw) as PromptItem[];

  console.log(`✅ Items in JSON: ${items.length}`);

  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: SUBJECT_SLUG },
    select: { id: true, name: true, slug: true, level: true, phase: true },
  });

  if (!subject) {
    throw new Error(
      `CurriculumSubject slug "${SUBJECT_SLUG}" not found. Seed the curriculum first.`
    );
  }

  console.log(
    `🔎 ${CHECK_MODE ? "CHECK MODE: verifying indicators exist (no writes)" : "Seeding ImagePrompt"} for ${subject.name} (${subject.slug})`
  );

  let verified = 0;
  let missing = 0;
  let created = 0;
  let updated = 0;

  for (const item of items) {
    if (item.nodeType !== "indicator") continue;

    const indicatorCode = item.indicatorCode;
    if (!indicatorCode) continue;

    // Verify indicator exists under THIS subject (avoid false matches across subjects)
    const ind = await prisma.curriculumIndicator.findFirst({
      where: {
        code: indicatorCode,
        contentStandard: {
          subStrand: {
            strand: {
              subjectId: subject.id,
            },
          },
        },
      },
      select: { id: true },
    });

    if (!ind) {
      console.log(`❌ MISSING indicator in DB: ${indicatorCode}`);
      missing++;
      continue;
    }

    console.log(`✅ OK: ${indicatorCode} → indicatorId=${ind.id}`);
    verified++;

    if (CHECK_MODE) continue;

    // Dedupe-safe upsert without relying on Prisma's generated compound-unique name
    const existing = await prisma.imagePrompt.findFirst({
      where: {
        subject: item.subject,
        strandCode: item.strandCode,
        subStrandCode: item.subStrandCode ?? null,
        contentStandardCode: item.contentStandardCode ?? null,
        indicatorCode: item.indicatorCode ?? null,
        exemplarIndex: item.exemplarIndex ?? null,
        nodeType: item.nodeType,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.imagePrompt.update({
        where: { id: existing.id },
        data: {
          phase: item.phase,
          level: item.level,
          ageBand: item.ageBand,
          prompt: item.prompt,
        },
      });
      updated++;
      console.log(`✏️ updated: ${indicatorCode}`);
    } else {
      await prisma.imagePrompt.create({
        data: {
          phase: item.phase,
          level: item.level,
          subject: item.subject,
          strandCode: item.strandCode,
          subStrandCode: item.subStrandCode ?? null,
          contentStandardCode: item.contentStandardCode ?? null,
          indicatorCode: item.indicatorCode ?? null,
          exemplarIndex: item.exemplarIndex ?? null,
          nodeType: item.nodeType,
          ageBand: item.ageBand,
          prompt: item.prompt,
        },
      });
      created++;
      console.log(`➕ created: ${indicatorCode}`);
    }
  }

  console.log(
    `🎉 Done. verified=${verified}, missing=${missing}, created=${created}, updated=${updated}`
  );
}

main()
  .catch((err) => {
    console.error("❌ Error seeding Basic 1 Mathematics image prompts:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
