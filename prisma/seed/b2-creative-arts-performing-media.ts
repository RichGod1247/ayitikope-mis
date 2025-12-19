// prisma/seed/b2-creative-arts-performing-media.ts
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MediaSeedItem = {
  phase: string;
  level: string;
  subject: string;
  subjectSlug: string;

  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;

  assetType?: string;
  ageBand?: string;

  imagePath: string;
  caption?: string;
  altText: string;
  detailedDescription?: string;

  sourceDocumentTitle?: string;
  sourceDocumentYear?: number;
  sourcePage?: number;

  pageNumberInPdf?: number;
  figureLabel?: string;
  tags?: string[] | string;
};

function toNaccaB2IndicatorCode(indicatorCode: string): string {
  const parts = indicatorCode.split('.');
  if (parts.length !== 5) {
    return indicatorCode;
  }

  const [prefix, ...rest] = parts;
  const base = rest.slice(0, 4).join('.');
  return `${prefix} ${base}`;
}

async function main() {
  const seedPath = path.join(
    __dirname,
    'curriculum',
    'b2-creative-arts-performing-media.json'
  );

  console.log(
    `📖 Loading B2 Creative Arts (Performing) media seed from: ${seedPath}`
  );

  if (!fs.existsSync(seedPath)) {
    console.error('❌ Seed file not found at path:', seedPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(seedPath, 'utf-8');
  const items: MediaSeedItem[] = JSON.parse(raw);

  console.log(`   Items in JSON: ${items.length}`);

  for (const item of items) {
    const label = `${item.indicatorCode} (${item.subjectSlug})`;
    console.log(`\n→ Processing indicator ${label}`);

    const candidateCodes: string[] = [
      item.indicatorCode,
      toNaccaB2IndicatorCode(item.indicatorCode),
    ].filter(Boolean);

    const indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: { in: candidateCodes },
        contentStandard: {
          subStrand: {
            strand: {
              subject: {
                slug: item.subjectSlug,
              },
            },
          },
        },
      },
    });

    if (!indicator) {
      console.warn(
        `   ⚠️ Could not find indicator for codes [${candidateCodes.join(
          ', '
        )}] (subjectSlug=${item.subjectSlug}). Skipping.`
      );
      continue;
    }

    console.log(`   ✅ Found indicator ${indicator.code} (id=${indicator.id})`);

    let tags: string = '';
    if (Array.isArray(item.tags)) {
      tags = item.tags.join(', ');
    } else if (typeof item.tags === 'string') {
      tags = item.tags;
    }

    const pageNumberInPdf =
      typeof item.pageNumberInPdf === 'number'
        ? item.pageNumberInPdf
        : typeof item.sourcePage === 'number'
        ? item.sourcePage
        : 0;

    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath: item.imagePath,
      },
    });

    if (existing) {
      console.log(
        `   🔁 Existing media found (id=${existing.id}), updating...`
      );

      const detailedDescription: string =
        item.detailedDescription ??
        (existing.detailedDescription ?? existing.altText);

      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: {
          figureLabel:
            item.figureLabel ?? item.caption ?? existing.figureLabel ?? '',
          imagePath: item.imagePath,
          altText: item.altText,
          detailedDescription,
          tags,
          pageNumberInPdf,
        },
      });

      console.log('   ✅ Updated existing media row.');
    } else {
      console.log('   ➕ No existing media found, creating new row...');

      const detailedDescription: string =
        item.detailedDescription ?? item.caption ?? item.altText;

      await prisma.curriculumMedia.create({
        data: {
          figureLabel: item.figureLabel ?? item.caption ?? '',
          imagePath: item.imagePath,
          altText: item.altText,
          detailedDescription,
          tags,
          pageNumberInPdf,
          indicator: {
            connect: { id: indicator.id },
          },
        },
      });

      console.log('   ✅ Created CurriculumMedia row.');
    }
  }

  console.log('\n🎉 Done seeding B2 Creative Arts (Performing) media.');
}

async function mainReal() {
  try {
    await main();
  } catch (err) {
    console.error('❌ Error in B2 Creative Arts (Performing) media seed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

mainReal();
