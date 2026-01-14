/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

type MediaRow = {
  indicatorId: string;
  indicatorCode: string;
  indicatorDescription: string;
  pageNumberInPdf?: number | null;
  figureLabel?: string | null;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags?: string | null;
};

const prisma = new PrismaClient();

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function loadJson(filePath: string): MediaRow[] {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error("JSON root must be an array");
    return data as MediaRow[];
  } catch (e: any) {
    // Print a helpful excerpt location
    console.error("❌ Invalid JSON in:", filePath);
    console.error(e?.message ?? e);
    throw e;
  }
}

async function main() {
  // Adjust if you store it elsewhere:
  const jsonPath = path.resolve(
    process.cwd(),
    "prisma/seed/curriculum/basic-5-creative-arts-media.json"
  );

  console.log("📖 Loading Basic 5 Creative Arts media seed from:", jsonPath);
  const rows = loadJson(jsonPath);

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    if (!row.indicatorId || !row.imagePath) {
      throw new Error(
        `Bad row: missing indicatorId or imagePath. indicatorCode=${row.indicatorCode}`
      );
    }

    // 1) Check if media already exists for this indicator (canonical)
    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicator: { id: row.indicatorId },
      },
      select: { id: true },
    });

    const data = {
      imagePath: row.imagePath,
      altText: row.altText,
      detailedDescription: row.detailedDescription,
      tags: row.tags ?? null,
      pageNumberInPdf: row.pageNumberInPdf ?? 0,
      figureLabel: row.figureLabel ?? null,

      // IMPORTANT: We connect indicator via relation (your schema does NOT accept indicatorId scalar)
      indicator: { connect: { id: row.indicatorId } },
    };

    if (existing) {
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
    } else {
      await prisma.curriculumMedia.create({ data });
      created += 1;
    }
  }

  console.log("✅ Basic 5 Creative Arts media seeded");
  console.log({ created, updated, total: created + updated });

  console.log("🔍 VERIFY (RUN YOUR 2 QUERIES):");
  console.log("  1) Count ONLY Basic 5 Creative Arts media (EXPECTED = " + (created + updated) + ")");
  console.log("  2) List the exact files (sanity check)");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
