import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const IN_JSON = path.join(
  process.cwd(),
  "prisma/seed/curriculum/basic-5-mathematics-media.json"
);

type Row = {
  indicatorId: string;
  indicatorCode: string;
  indicatorDescription: string | null;
  pageNumberInPdf: number;
  figureLabel: string | null;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags: string;
};

async function main() {
  const raw = fs.readFileSync(IN_JSON, "utf8");
  const rows = JSON.parse(raw) as Row[];
  if (!rows.length) throw new Error("No rows found in JSON.");

  // ✅ PRE-CHECK: find any indicatorIds in JSON that don't exist in DB
  const ids = [...new Set(rows.map((r) => r.indicatorId))];
  const found = await prisma.curriculumIndicator.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const foundSet = new Set(found.map((x) => x.id));

  const missing = rows.filter((r) => !foundSet.has(r.indicatorId));
  if (missing.length) {
    console.error("❌ These rows reference missing CurriculumIndicator IDs:");
    for (const m of missing) {
      console.error(
        `- indicatorId=${m.indicatorId} code=${m.indicatorCode} image=${m.imagePath}`
      );
    }
    throw new Error(
      `Stop: ${missing.length} row(s) have indicatorId not present in CurriculumIndicator. Fix JSON/DB first.`
    );
  }

  let created = 0;
  let updated = 0;

  for (const r of rows) {
    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: r.indicatorId,
        imagePath: r.imagePath,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: {
          altText: r.altText,
          detailedDescription: r.detailedDescription,
          tags: r.tags,
          pageNumberInPdf: r.pageNumberInPdf,
          figureLabel: r.figureLabel,
        },
      });
      updated++;
    } else {
      await prisma.curriculumMedia.create({
        data: {
          indicatorId: r.indicatorId,
          imagePath: r.imagePath,
          altText: r.altText,
          detailedDescription: r.detailedDescription,
          tags: r.tags,
          pageNumberInPdf: r.pageNumberInPdf,
          figureLabel: r.figureLabel,
        },
      });
      created++;
    }
  }

  console.log(
    `✅ Seed complete. Created: ${created}, Updated: ${updated}, Total: ${rows.length}`
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
