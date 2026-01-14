// prisma/seed/basic-1-science-media.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type MediaRow = {
  code: string;
  url?: string;
  imagePath?: string;

  detailedDescription?: string;
  altText?: string;

  tags?: string | string[];

  pageNumberInPdf?: number;
  orderIndex?: number; // not in DB; we can encode into figureLabel
  figureLabel?: string | null;
};

function normalizeTags(tags: MediaRow["tags"]): string {
  if (!tags) return "";
  if (Array.isArray(tags)) return tags.filter(Boolean).join(", ");
  return String(tags ?? "");
}

function figLabel(orderIndex?: number) {
  if (typeof orderIndex !== "number") return null;
  return `Fig ${String(orderIndex).padStart(2, "0")}`;
}

async function main() {
  const jsonPath = path.join(
    process.cwd(),
    "prisma",
    "seed",
    "curriculum",
    "basic-1-science-media.json"
  );

  console.log(`📖 Loading Basic 1 Science media seed from: ${jsonPath}`);

  // ✅ Fail fast if JSON is invalid
  const raw = fs.readFileSync(jsonPath, "utf8").trim();
  const rows: MediaRow[] = JSON.parse(raw);

  let createdOrUpdated = 0;
  let attachedToIndicators = 0;
  let missingIndicators = 0;
  let failed = 0;
  const failedCodes: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    const imagePath = r.imagePath ?? r.url;
    if (!r.code || !imagePath) {
      failed++;
      failedCodes.push(r.code ?? `(row ${i + 1})`);
      console.error(`❌ Row ${i + 1} missing code or imagePath/url`);
      continue;
    }

    const detailedDescription =
      r.detailedDescription ??
      `Illustration for Basic 1 Science indicator ${r.code}`;

    // ✅ Your schema requires altText: String (NOT NULL)
    const altText = (r.altText && r.altText.trim()) ? r.altText : detailedDescription;

    const figureLabel = r.figureLabel ?? figLabel(r.orderIndex);

    try {
      // ✅ Your schema does NOT make code unique, so use findFirst (NOT findUnique)
      const indicator = await prisma.curriculumIndicator.findFirst({
        where: { code: r.code },
        select: { id: true, code: true },
      });

      if (!indicator) {
        missingIndicators++;
        console.warn(`⚠️ Missing indicator for code: ${r.code}`);
        continue;
      }

      // ✅ Your schema enforces @@unique([indicatorId, imagePath])
      // We avoid guessing the compound unique key name by doing findFirst + update/create.
      const existing = await prisma.curriculumMedia.findFirst({
        where: {
          indicatorId: indicator.id,
          imagePath,
        },
        select: { id: true },
      });

      const data = {
        pageNumberInPdf: r.pageNumberInPdf ?? 0,
        imagePath,
        detailedDescription,
        altText,
        tags: normalizeTags(r.tags) || null,
        figureLabel,
        indicator: { connect: { id: indicator.id } },
      } as const;

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
      console.log(`✅ ${r.code} -> media saved`);
    } catch (err: any) {
      failed++;
      failedCodes.push(r.code);
      console.error(`❌ ${r.code} -> CurriculumMedia write failed. Last error:`);
      console.error(err?.message ?? err);
    }
  }

  console.log(`\n📦 Basic 1 Science media seeding complete.`);
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
