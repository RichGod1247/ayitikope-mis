import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// CONFIG
const SUBJECT_SLUG = "basic-4-mathematics";
const OUT_JSON = path.join(
  process.cwd(),
  "prisma/seed/curriculum/basic-4-mathematics-media.json"
);

// ✅ Canonical: DB code already uses dots e.g. "B4.1.1.1.1"
// So filename is exactly `${code}.png`
function filenameFromCode(code: string): string {
  return `${code}.png`;
}

function imagePathFromCode(code: string): string {
  const file = filenameFromCode(code);
  return `https://pub-f33886c26f33473d91e2bf1505b9df29.r2.dev/upper-primary/basic-4/basic-4-mathematics/${file}`;
}

function altFrom(code: string, desc: string): string {
  return `Basic 4 Mathematics ${code}: ${desc}`.slice(0, 180);
}

async function main() {
  const indicators = await prisma.curriculumIndicator.findMany({
    where: {
      contentStandard: {
        subStrand: {
          strand: {
            subject: { slug: SUBJECT_SLUG },
          },
        },
      },
    },
    select: { id: true, code: true, description: true },
    orderBy: { code: "asc" },
  });

  if (!indicators.length) {
    throw new Error(`No indicators found for subject slug "${SUBJECT_SLUG}"`);
  }

  const rows = indicators.map((i) => ({
    indicatorId: i.id,
    indicatorCode: i.code, // DB source of truth (dots)
    indicatorDescription: i.description,
    pageNumberInPdf: 0,
    figureLabel: null,
    imagePath: imagePathFromCode(i.code),
    altText: altFrom(i.code, i.description || "Illustration."),
    detailedDescription: `Illustration for Basic 4 Mathematics indicator ${i.code} — ${i.description}`,
    tags: `curriculum,upper-primary,basic-4,mathematics`,
  }));

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(rows, null, 2), "utf8");

  console.log(`✅ Built media JSON from DB: ${OUT_JSON}`);
  console.log(`   Indicators found: ${indicators.length}`);
  console.log(`   Rows written: ${rows.length}`);
  console.log("   First:", rows[0].indicatorCode, rows[0].imagePath);
  console.log("   Last :", rows[rows.length - 1].indicatorCode, rows[rows.length - 1].imagePath);
}

main()
  .catch((e) => {
    console.error("❌ Build failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
