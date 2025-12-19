import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

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

async function mainReal() {
  const seedPath = path.join(
    __dirname,
    'curriculum',
    'kg1-language-and-literacy-media.json'
  );

  console.log(
    '📖 Loading KG1 Language & Literacy media seed from:',
    seedPath
  );

  const raw = fs.readFileSync(seedPath, 'utf8');
  const items: MediaSeedRow[] = JSON.parse(raw);

  console.log('   Items in JSON:', items.length);
  console.log();

  for (const row of items) {
    console.log(
      `→ Processing indicator ${row.indicatorCode} (${row.subjectSlug})`
    );

    const indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: row.indicatorCode,
        contentStandard: {
          code: row.contentStandardCode,
          subStrand: {
            code: row.subStrandCode,
            strand: {
              code: row.strandCode,
              subject: {
                slug: row.subjectSlug
              }
            }
          }
        }
      },
      include: {
        media: true
      }
    });

    if (!indicator) {
      console.log(
        `   ⚠️ Could not find indicator ${row.indicatorCode} ` +
          `(strand=${row.strandCode}, subStrand=${row.subStrandCode}, ` +
          `contentStandard=${row.contentStandardCode}, subjectSlug=${row.subjectSlug}). Skipping.`
      );
      console.log();
      continue;
    }

    // Check if we already have media for this indicator + imagePath
    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath: row.imagePath
      }
    });

    if (existing) {
      console.log(
        `   🔁 Existing media found (id=${existing.id}), updating...`
      );
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: {
          figureLabel: row.figureLabel,
          imagePath: row.imagePath,
          altText: row.altText,
          detailedDescription: row.detailedDescription,
          tags: row.tags ? row.tags.join(', ') : undefined,
          pageNumberInPdf: row.pageNumberInPdf
        }
      });
      console.log('   ✅ Updated existing media row.');
      console.log();
    } else {
      console.log('   ➕ No existing media found, creating new row...');
      const created = await prisma.curriculumMedia.create({
        data: {
          figureLabel: row.figureLabel,
          imagePath: row.imagePath,
          altText: row.altText,
          detailedDescription: row.detailedDescription,
          tags: row.tags ? row.tags.join(', ') : undefined,
          pageNumberInPdf: row.pageNumberInPdf,
          indicator: {
            connect: { id: indicator.id }
          }
        }
      });
      console.log(
        `   ✅ Created CurriculumMedia with id=${created.id}`
      );
      console.log();
    }
  }

  console.log('🎉 Done seeding KG1 Language & Literacy media.');
}

async function main() {
  try {
    await mainReal();
  } catch (err) {
    console.error('❌ Error in KG1 Language & Literacy media seed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
