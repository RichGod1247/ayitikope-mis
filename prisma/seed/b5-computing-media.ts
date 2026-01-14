import { PrismaClient, Prisma } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const SUBJECT_SLUG = "basic-5-computing";

function hasField(modelName: string, fieldName: string) {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === modelName);
  return !!m?.fields?.some((f) => f.name === fieldName);
}

type Row = {
  indicatorId: string;
  indicatorCode: string;
  indicatorDescription: string;
  pageNumberInPdf: number;
  figureLabel: null;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags: string;
};

async function main() {
  const jsonPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(process.cwd(), "prisma", "seed", "curriculum", "basic-5-computing-media.clean.json");

  console.log("🔎 Seeding B5 Computing media (B4-style, indicatorId-based)…");
  console.log(`📖 JSON: ${jsonPath}`);

  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: SUBJECT_SLUG },
    select: { id: true, slug: true, name: true },
  });
  if (!subject) throw new Error(`Subject not found: ${SUBJECT_SLUG}`);
  console.log("✅ Subject OK:", subject);

  const rows = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Row[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("JSON must be a non-empty array.");

  // Optional fields (don’t crash if schema differs)
  const mediaHasPage = hasField("CurriculumMedia", "pageNumberInPdf");
  const mediaHasFigure = hasField("CurriculumMedia", "figureLabel");
  const mediaHasDetailed = hasField("CurriculumMedia", "detailedDescription");
  const mediaHasIndicatorDesc = hasField("CurriculumMedia", "indicatorDescription");
  const mediaHasIndicatorCode = hasField("CurriculumMedia", "indicatorCode");

  let created = 0, updated = 0, failed = 0;

  for (const r of rows) {
    try {
      if (!r.indicatorId) throw new Error("Missing indicatorId");
      if (!r.imagePath) throw new Error("Missing imagePath");

      // Ensure indicator exists (hard fail per row if not)
      const ind = await prisma.curriculumIndicator.findUnique({
        where: { id: r.indicatorId },
        select: { id: true },
      });
      if (!ind) throw new Error(`Indicator not found by id: ${r.indicatorId} (${r.indicatorCode})`);

      // Collision-safe upsert without relying on a named unique constraint
      const existing = await prisma.curriculumMedia.findFirst({
        where: { indicatorId: r.indicatorId, imagePath: r.imagePath },
        select: { id: true },
      });

      const createData: any = {
        subjectId: subject.id,
        indicatorId: r.indicatorId,
        imagePath: r.imagePath,
        altText: r.altText,
        tags: r.tags ?? "",
      };

      const updateData: any = {
        subjectId: subject.id,
        altText: r.altText,
        tags: r.tags ?? "",
      };

      if (mediaHasPage) {
        createData.pageNumberInPdf = r.pageNumberInPdf ?? 0;
        updateData.pageNumberInPdf = r.pageNumberInPdf ?? 0;
      }
      if (mediaHasFigure) {
        createData.figureLabel = r.figureLabel ?? null;
        updateData.figureLabel = r.figureLabel ?? null;
      }
      if (mediaHasDetailed) {
        createData.detailedDescription = r.detailedDescription ?? null;
        updateData.detailedDescription = r.detailedDescription ?? null;
      }
      if (mediaHasIndicatorDesc) {
        createData.indicatorDescription = r.indicatorDescription ?? null;
        updateData.indicatorDescription = r.indicatorDescription ?? null;
      }
      if (mediaHasIndicatorCode) {
        createData.indicatorCode = r.indicatorCode ?? null;
        updateData.indicatorCode = r.indicatorCode ?? null;
      }

      if (existing) {
        await prisma.curriculumMedia.update({ where: { id: existing.id }, data: updateData });
        updated++;
      } else {
        await prisma.curriculumMedia.create({ data: createData });
        created++;
      }

      console.log(`✅ ${r.indicatorCode}`);
    } catch (e: any) {
      failed++;
      console.log(`❌ ${r.indicatorCode}: ${e?.message ?? String(e)}`);
    }
  }

  console.log("\n📦 Done:", { total: rows.length, created, updated, failed });
}

main()
  .catch((e) => {
    console.error("💥 Seeder crashed:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
