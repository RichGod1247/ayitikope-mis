// prisma/seed/kg1-creative-arts-media.ts
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JSON file for KG1 Creative Arts media
const MEDIA_JSON_PATH = path.join(
  __dirname,
  'curriculum',
  'kg1-creative-arts-media.json'
);

// This must match the slug in edulife_os."CurriculumSubject"
const SUBJECT_SLUG = 'kg1-creative-arts';

type RawTags = string[] | string | null | undefined;

interface CreativeArtsMediaSeedItem {
  subjectSlug: string;
  phase?: string;
  level?: string;

  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;

  pageNumberInPdf?: number;
  figureLabel?: string | null;

  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags?: RawTags;
}

function normaliseTags(raw: RawTags): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.join(', ');
  return raw;
}

// Make sure imagePath always looks like: /curriculum/kg1/creative-arts/...
function normaliseImagePath(raw: string): string {
  let p = raw.trim();
  p = p.replace(/^\/+/, ''); // remove all leading slashes
  return '/' + p; // add exactly one
}

async function main() {
  console.log(`📖 Loading KG1 Creative Arts media seed from: ${MEDIA_JSON_PATH}`);

  const raw = await fs.readFile(MEDIA_JSON_PATH, 'utf-8');
  const items: CreativeArtsMediaSeedItem[] = JSON.parse(raw);

  console.log(`   Items in JSON: ${items.length}`);

  // 1️⃣ Load the subject once by slug
  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: SUBJECT_SLUG },
  });

  if (!subject) {
    throw new Error(
      `CurriculumSubject with slug "${SUBJECT_SLUG}" not found in schema "edulife_os".`
    );
  }

  console.log(
    `🎯 Target subject: ${subject.slug} (id=${subject.id}) – starting media upsert...`
  );

  let processed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    processed += 1;
    console.log(
      `\n→ [${processed}/${items.length}] Processing indicator ${item.indicatorCode}`
    );

    // 2️⃣ Find matching indicator UNDER this subject
    const indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: item.indicatorCode,
        contentStandard: {
          code: item.contentStandardCode,
          subStrand: {
            code: item.subStrandCode,
            strand: {
              code: item.strandCode,
              subjectId: subject.id,
            },
          },
        },
      },
    });

    if (!indicator) {
      console.warn(
        `   ⚠️ Could not find indicator ${item.indicatorCode} ` +
          `(strand=${item.strandCode}, subStrand=${item.subStrandCode}, ` +
          `contentStandard=${item.contentStandardCode}, subjectSlug=${SUBJECT_SLUG}). Skipping.`
      );
      skipped += 1;
      continue;
    }

    console.log(`   ✅ Found indicator ${item.indicatorCode} (id=${indicator.id})`);

    const tags = normaliseTags(item.tags) ?? '';
    const imagePath = normaliseImagePath(item.imagePath);

    const data = {
      subjectId: subject.id,
      indicatorId: indicator.id,
      figureLabel: item.figureLabel ?? null,
      imagePath,
      altText: item.altText,
      detailedDescription: item.detailedDescription,
      tags,
      pageNumberInPdf: item.pageNumberInPdf ?? 0,
    };

    // 3️⃣ Check if media row already exists for this indicator + imagePath
    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath,
      },
    });

    if (existing) {
      console.log(`   🔁 Existing media found (id=${existing.id}), updating...`);
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
      console.log(`   ✅ Updated existing media row.`);
    } else {
      console.log(`   ➕ No existing media found, creating new row...`);
      const createdRow = await prisma.curriculumMedia.create({ data });
      created += 1;
      console.log(`   ✅ Created CurriculumMedia with id=${createdRow.id}`);
    }
  }

  console.log(
    `\n🎉 Done seeding KG1 Creative Arts media. ` +
      `Processed: ${processed}, Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`
  );
}

main()
  .catch((e) => {
    console.error('❌ Error in KG1 Creative Arts media seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
