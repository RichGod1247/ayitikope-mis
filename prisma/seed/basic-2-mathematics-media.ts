// prisma/seed/basic-2-mathematics-media.ts
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

type MediaItemJson = {
  indicatorCode: string;
  asset: string; // filename WITHOUT extension
  title?: string; // we map this to figureLabel
  altText: string;
  caption?: string; // we map this into detailedDescription
  tags?: string[]; // DB expects string, we join
  orderIndex?: number;

  // required by your schema (we default)
  pageNumberInPdf?: number;
  detailedDescription?: string;
};

type MediaSeedJson = {
  subjectSlug: string;
  phase: string;
  level: string;
  assetDir: string; // relative to /public, e.g. "curriculum/lower-primary/basic-2/basic-2-mathematics"
  items: MediaItemJson[];
};

function tryExts(stem: string) {
  return [`${stem}.png`, `${stem}.jpg`, `${stem}.jpeg`, `${stem}.webp`];
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveAssetFile(publicRoot: string, assetDir: string, assetStem: string) {
  const relDir = assetDir.replace(/\\/g, "/");
  for (const name of tryExts(assetStem)) {
    const abs = path.join(publicRoot, relDir, name);
    if (await exists(abs)) {
      const imagePath = `/${relDir}/${name}`.replace(/\\/g, "/");
      return { absPath: abs, imagePath };
    }
  }
  return null;
}

function tagsToString(tags?: string[]) {
  const arr = (tags ?? []).map((t) => t.trim()).filter(Boolean);
  return arr.length ? arr.join(", ") : null;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const CHECK = args.has("--check");
  const RESET = args.has("--reset");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const jsonPath = path.join(__dirname, "curriculum", "basic-2-mathematics-media.json");
  const raw = await fs.readFile(jsonPath, "utf8");
  const mediaSeed = JSON.parse(raw) as MediaSeedJson;

  console.log(`📦 Seeding Basic 2 Mathematics media from: ${jsonPath}`);
  console.log(`→ subjectSlug: ${mediaSeed.subjectSlug}`);
  console.log(`→ items: ${mediaSeed.items.length}`);

  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: mediaSeed.subjectSlug },
    select: { id: true, slug: true, name: true },
  });

  if (!subject) {
    throw new Error(
      `No curriculumSubject found for slug "${mediaSeed.subjectSlug}". Seed the curriculum first (basic-2-mathematics.ts).`
    );
  }

  const subjectId = subject.id;

  // prisma/seed -> ../../public
  const publicRoot = path.join(__dirname, "..", "..", "public");
  const relDir = mediaSeed.assetDir.replace(/\\/g, "/");

  if (CHECK) {
    let ok = 0;
    const missing: { indicatorCode: string; asset: string; reason: string }[] = [];

    for (const item of mediaSeed.items) {
      const indicator = await prisma.curriculumIndicator.findFirst({
        where: {
          code: item.indicatorCode,
          contentStandard: {
            subStrand: {
              strand: { subjectId },
            },
          },
        },
        select: { id: true },
      });

      if (!indicator) {
        missing.push({ indicatorCode: item.indicatorCode, asset: item.asset, reason: "Indicator not found in DB" });
        continue;
      }

      const file = await resolveAssetFile(publicRoot, mediaSeed.assetDir, item.asset);
      if (!file) {
        missing.push({ indicatorCode: item.indicatorCode, asset: item.asset, reason: "Image file not found in /public" });
        continue;
      }

      ok++;
    }

    console.log(`✅ CHECK: subject exists: ${subject.name} (${subject.slug})`);
    console.log(`✅ CHECK: items OK (indicator+file found): ${ok}`);
    console.log(`⚠️ CHECK: items missing (indicator or file): ${missing.length}`);

    if (missing.length) {
      console.log("— Missing details:");
      for (const m of missing) {
        console.log(`   • ${m.indicatorCode} | ${m.asset}  → ${m.reason}`);
      }
    }
    return;
  }

  if (RESET) {
    console.log(`⚠️ --reset: deleting existing media under: /${relDir}/ for subject: ${subject.slug}`);
    await prisma.curriculumMedia.deleteMany({
      where: {
        indicator: {
          contentStandard: {
            subStrand: {
              strand: { subjectId },
            },
          },
        },
        imagePath: { startsWith: `/${relDir}/` },
      },
    });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of mediaSeed.items) {
    const indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: item.indicatorCode,
        contentStandard: {
          subStrand: {
            strand: { subjectId },
          },
        },
      },
      select: { id: true, code: true },
    });

    if (!indicator) {
      console.warn(`⚠️ Missing indicator in DB: ${item.indicatorCode} (skipping)`);
      skipped++;
      continue;
    }

    const file = await resolveAssetFile(publicRoot, mediaSeed.assetDir, item.asset);
    if (!file) {
      console.warn(`⚠️ Missing image file for: ${item.asset} (skipping)`);
      skipped++;
      continue;
    }

    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath: file.imagePath,
      },
      select: { id: true },
    });

    // ✅ Your real schema fields (NO title/caption)
    const baseData = {
      imagePath: file.imagePath,
      pageNumberInPdf: item.pageNumberInPdf ?? 0,
      detailedDescription:
        item.detailedDescription ??
        item.caption ??
        item.altText ??
        `Illustration for ${item.indicatorCode}`,

      figureLabel: item.title ?? null, // ✅ title -> figureLabel
      altText: item.altText,
      tags: tagsToString(item.tags),
    };

    if (existing) {
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: baseData,
      });
      updated++;
      console.log(`🔁 Updated: ${item.indicatorCode} -> ${file.imagePath}`);
    } else {
      await prisma.curriculumMedia.create({
        data: {
          ...baseData,
          subjectId,
          indicatorId: indicator.id,
        },
      });
      created++;
      console.log(`✅ Created: ${item.indicatorCode} -> ${file.imagePath}`);
    }
  }

  console.log(`🎉 Done Basic 2 Mathematics media. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}.`);
}

main()
  .catch((err) => {
    console.error("❌ Error seeding Basic 2 Mathematics media:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
