import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEDIA_FILE = path.join(
  __dirname,
  "curriculum",
  "basic-4-creative-arts-media.sql.json"
);

// Read JSON safely (BOM + junk tolerant)
function readCleanJson(filePath: string) {
  return fs
    .readFileSync(filePath, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/[\u0000-\u001F]+/g, "")
    .trim();
}

async function main() {
  const rows = JSON.parse(readCleanJson(MEDIA_FILE));

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicator: { id: row.indicatorId },
      },
      select: { id: true },
    });

    const data = {
      indicator: {
        connect: { id: row.indicatorId },
      },
      imagePath: row.imagePath,
      altText: row.altText,
      detailedDescription: row.detailedDescription,
      pageNumberInPdf: row.pageNumberInPdf ?? 0,
      figureLabel: row.figureLabel ?? null,
      tags: row.tags ?? null,
    };

    if (!existing) {
      await prisma.curriculumMedia.create({ data });
      created++;
    } else {
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data,
      });
      updated++;
    }
  }

  console.log("✅ Basic 4 Creative Arts media seeded");
  console.log({ created, updated, total: rows.length });
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
