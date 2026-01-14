import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// CONFIG
const SUBJECT_SLUG = "basic-5-creative-arts";
const OUT_JSON = path.join(
  process.cwd(),
  "prisma/seed/curriculum/basic-5-creative-arts-media.json"
);

// Map indicator code -> folder (Visual vs Performing)
function categoryFromCode(code: string): "visual-arts" | "performing-arts" {
  // DB uses: "B5 1.x.x.x" for Visual, "B5 2.x.x.x" for Performing
  if (code.startsWith("B5 1.")) return "visual-arts";
  if (code.startsWith("B5 2.")) return "performing-arts";
  // Fallback: keep it visual so you notice quickly
  return "visual-arts";
}

function filenameFromCode(code: string): string {
  // Convert DB code "B5 1.1.1.1" -> file "B5.1.1.1.1.png"
  // IMPORTANT: DO NOT append ".1" — canonical is ".png"
  const dotBase = code.replace(" ", "."); // "B5 1.1.1.1" -> "B5.1.1.1.1"
  return `${dotBase}.png`;
}

function imagePathFromCode(code: string): string {
  const cat = categoryFromCode(code);
  const file = filenameFromCode(code);
  return `https://pub-f33886c26f33473d91e2bf1505b9df29.r2.dev/upper-primary/basic-5/basic-5-creative-arts/${cat}/${file}`;
}

function altFrom(code: string, desc: string): string {
  return `Basic 5 Creative Arts ${code}: ${desc}`.slice(0, 180);
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
    indicatorCode: i.code, // DB source-of-truth code (with spaces)
    indicatorDescription: i.description,
    pageNumberInPdf: 0,
    figureLabel: null,
    imagePath: imagePathFromCode(i.code),
    altText: altFrom(i.code, i.description || "Illustration."),
    detailedDescription: `Illustration for Basic 5 Creative Arts indicator ${i.code} — ${i.description}`,
    tags: `curriculum,upper-primary,basic-5,creative-arts,${categoryFromCode(i.code)}`,
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
