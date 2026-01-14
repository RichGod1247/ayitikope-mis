import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), "prisma", ".env") });

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MediaSeedRow = {
  subjectSlug: string;
  phase: string;
  level: string;

  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;

  pageNumberInPdf: number;
  figureLabel?: string;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags?: string[];
};

function logDbTarget() {
  const raw = process.env.DATABASE_URL || "";
  try {
    const u = new URL(raw);
    const user = u.username || "(unknown-user)";
    const host = u.hostname || "(unknown-host)";
    const port = u.port || "(no-port)";
    console.log(`🔌 DB target: ${host}:${port} | user: ${user}`);
  } catch {
    console.log("🔌 DB target: (could not parse DATABASE_URL)");
  }
}

async function mainReal() {
  logDbTarget();

  const seedPath = path.join(
    __dirname,
    "curriculum",
    "basic-3-our-world-and-our-people-media.json"
  );

  console.log("📖 Loading B3 OWOP media seed from:", seedPath);

  const raw = fs.readFileSync(seedPath, "utf8");
  const items: MediaSeedRow[] = JSON.parse(raw);

  console.log("   Items in JSON:", items.length);
  console.log();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let fallbackHits = 0;

  for (const row of items) {
    console.log(`→ Processing indicator ${row.indicatorCode} (${row.subjectSlug})`);

    // 1) Strict lookup (full hierarchy match)
    let indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: row.indicatorCode,
        contentStandard: {
          code: row.contentStandardCode,
          subStrand: {
            code: row.subStrandCode,
            strand: {
              code: row.strandCode,
              subject: { slug: row.subjectSlug },
            },
          },
        },
      },
      select: { id: true },
    });

    // 2) Fallback lookup (code + subjectSlug only)
    if (!indicator) {
      indicator = await prisma.curriculumIndicator.findFirst({
        where: {
          code: row.indicatorCode,
          contentStandard: {
            subStrand: {
              strand: {
                subject: { slug: row.subjectSlug },
              },
            },
          },
        },
        select: { id: true },
      });

      if (indicator) {
        fallbackHits++;
        console.log("   🧭 Used fallback lookup (code + subjectSlug).");
      }
    }

    if (!indicator) {
      console.log(
        `   ⚠️ Could not find indicator ${row.indicatorCode} in DB for subjectSlug=${row.subjectSlug}.`
      );
      console.log(
        "   👉 This usually means your *curriculum* seed for this subject is missing that indicator, OR the indicator code in the curriculum JSON is different."
      );
      console.log();
      skipped++;
      continue;
    }

    try {
      const existing = await prisma.curriculumMedia.findFirst({
        where: {
          indicatorId: indicator.id,
          imagePath: row.imagePath,
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.curriculumMedia.update({
          where: { id: existing.id },
          data: {
            figureLabel: row.figureLabel,
            imagePath: row.imagePath,
            altText: row.altText,
            detailedDescription: row.detailedDescription,
            tags: row.tags ? row.tags.join(", ") : undefined,
            pageNumberInPdf: row.pageNumberInPdf,
          },
        });
        console.log(`   ✅ Updated (id=${existing.id})\n`);
        updated++;
      } else {
        const newRow = await prisma.curriculumMedia.create({
          data: {
            figureLabel: row.figureLabel,
            imagePath: row.imagePath,
            altText: row.altText,
            detailedDescription: row.detailedDescription,
            tags: row.tags ? row.tags.join(", ") : undefined,
            pageNumberInPdf: row.pageNumberInPdf,
            indicator: { connect: { id: indicator.id } },
          },
          select: { id: true },
        });

        console.log(`   ✅ Created (id=${newRow.id})\n`);
        created++;
      }
    } catch (e) {
      console.log("   ❌ Failed to seed this row:", e);
      console.log();
      failed++;
    }
  }

  console.log("🎉 Done seeding B3 OWOP media.");
  console.log({ created, updated, skipped, failed, fallbackHits });
}

async function main() {
  try {
    await mainReal();
  } catch (err) {
    console.error("❌ Error in B3 OWOP media seed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
