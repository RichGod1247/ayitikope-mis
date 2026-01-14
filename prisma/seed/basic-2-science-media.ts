// prisma/seed/basic-2-science-media.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type MediaRow = {
  indicatorId: string;
  indicatorCode: string;
  indicatorDescription?: string;
  pageNumberInPdf: number;
  figureLabel?: string | null;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags?: string | null;
};

const SUBJECT_SLUG = "basic-2-science";

function requireString(v: unknown, label: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Missing/invalid ${label}`);
  return v;
}

async function main() {
  const jsonPath = path.join(process.cwd(), "prisma", "seed", "curriculum", "basic-2-science-media.json");
  console.log(`📖 Loading Basic 2 Science media seed from: ${jsonPath}`);

  const raw = fs.readFileSync(jsonPath, "utf8");
  const rows = JSON.parse(raw) as MediaRow[];

  // Attach subject too (helps future queries), but media still works even if you remove this.
  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: SUBJECT_SLUG },
    select: { id: true, slug: true },
  });
  if (!subject) throw new Error(`CurriculumSubject not found for slug: ${SUBJECT_SLUG}`);

  let createdOrUpdated = 0;
  let attachedToIndicators = 0;
  let missingIndicators = 0;
  let failed = 0;
  const failedCodes: string[] = [];

  for (const row of rows) {
    const indicatorId = requireString((row as any).indicatorId, "indicatorId");
    const indicatorCode = requireString((row as any).indicatorCode, "indicatorCode");

    try {
      const indicator = await prisma.curriculumIndicator.findUnique({
        where: { id: indicatorId },
        select: { id: true },
      });

      if (!indicator) {
        missingIndicators++;
        failed++;
        failedCodes.push(indicatorCode);
        console.log(`⚠️ ${indicatorCode} -> indicator NOT found by id (${indicatorId})`);
        continue;
      }

      // Avoid fragile "upsert compound unique" assumptions; use findFirst → update/create.
      const existing = await prisma.curriculumMedia.findFirst({
        where: { indicatorId: indicator.id, imagePath: row.imagePath },
        select: { id: true },
      });

      const data = {
        pageNumberInPdf: Number(row.pageNumberInPdf ?? 0),
        figureLabel: row.figureLabel ?? null,
        imagePath: requireString(row.imagePath, "imagePath"),
        altText: requireString(row.altText, "altText"),
        detailedDescription: requireString(row.detailedDescription, "detailedDescription"),
        tags: row.tags ?? "",
        subject: { connect: { id: subject.id } },
        indicator: { connect: { id: indicator.id } },
      };

      if (existing) {
        await prisma.curriculumMedia.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.curriculumMedia.create({ data });
      }

      createdOrUpdated++;
      attachedToIndicators++;
      console.log(`✅ ${indicatorCode} -> media saved`);
    } catch (err: any) {
      failed++;
      failedCodes.push(indicatorCode);
      console.log(`❌ ${indicatorCode} -> media write failed. Last error:\n${err?.message ?? err}`);
    }
  }

  console.log(`\n📦 Basic 2 Science media seeding complete.`);
  console.log({
    totalRows: rows.length,
    createdOrUpdated,
    attachedToIndicators,
    missingIndicators,
    failed,
  });

  if (failedCodes.length) {
    console.log(`\n❌ Failed codes:\n${failedCodes.join(", ")}`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
