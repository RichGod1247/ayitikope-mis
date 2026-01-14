import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const IN_JSON = path.join(
  process.cwd(),
  "prisma/seed/curriculum/basic-4-mathematics-media.json"
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

  console.log(`✅ Seed complete. Created: ${created}, Updated: ${updated}, Total: ${rows.length}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
