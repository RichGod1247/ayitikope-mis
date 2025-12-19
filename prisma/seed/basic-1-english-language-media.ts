// prisma/seed/basic-1-english-language-media.ts
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MediaSeedItem = {
  indicatorCode: string;
  fileName: string; // just used to build imagePath + descriptions
};

function buildImagePath(fileName: string): string {
  // ASSUMPTION: you saved the images under:
  // public/curriculum/basic-1/english-language/<fileName>.webp
  // If you used .png or another folder, just adjust this one function.
  return `/curriculum/basic-1/english-language/${fileName}.webp`;
}

function buildAltAndDescription(
  indicatorCode: string,
  fileName: string
): { altText: string; detailedDescription: string; tags: string } {
  let slug = fileName;

  // Strip common prefixes
  slug = slug.replace(/^basic-1-english-language-/, '');
  slug = slug.replace(/^b1-english-/, '');
  slug = slug.replace(/^b1-/, '');

  // Strip leading "B1.x.x.x.x-" if present
  slug = slug.replace(/^(B1\.\d+\.\d+\.\d+\.\d+\-)/, '');

  const phrase = slug.replace(/-/g, ' ').trim();

  const altText = `${indicatorCode}: Basic 1 learners ${phrase} in a Ghanaian classroom.`;

  const detailedDescription =
    `Curriculum media for indicator ${indicatorCode}. ` +
    `The illustration shows Basic 1 learners ${phrase} in a realistic Ghanaian classroom ` +
    `to help the teacher model the skill and stimulate observation, discussion and practice.`;

  // Basic tagging by strand (second digit in the indicator code)
  const strandDigit = indicatorCode.split('.')[1]; // e.g. "1", "2", "4", "5", "6"
  const tags: string[] = ['b1', 'english-language', 'ghana', 'curriculum-media'];

  if (strandDigit === '1') {
    tags.push('oral-language', 'listening-speaking');
  } else if (strandDigit === '2') {
    tags.push('reading', 'phonics', 'comprehension');
  } else if (strandDigit === '4') {
    tags.push('writing', 'handwriting', 'composition');
  } else if (strandDigit === '5') {
    tags.push('grammar', 'language-structure');
  } else if (strandDigit === '6') {
    tags.push('extensive-reading', 'library');
  }

  return {
    altText,
    detailedDescription,
    tags: tags.join(',')
  };
}

async function main() {
  const jsonPath = path.join(
    __dirname,
    'curriculum',
    'basic-1-english-language-media.json'
  );

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const items: MediaSeedItem[] = JSON.parse(raw);

  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: 'basic-1-english-language' }
  });

  if (!subject) {
    throw new Error(
      'CurriculumSubject with slug "basic-1-english-language" not found. Seed subjects first.'
    );
  }

  console.log(
    `📦 Seeding Basic 1 English Language media from ${items.length} entries`
  );

  for (const item of items) {
    const { indicatorCode, fileName } = item;

    const indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: indicatorCode,
        contentStandard: {
          subStrand: {
            strand: {
              subjectId: subject.id
            }
          }
        }
      },
      include: { contentStandard: true }
    });

    if (!indicator) {
      console.warn(
        `⚠️ Skipping ${indicatorCode} (${fileName}): indicator not found for this subject`
      );
      continue;
    }

    const imagePath = buildImagePath(fileName);
    const { altText, detailedDescription, tags } = buildAltAndDescription(
      indicatorCode,
      fileName
    );

    const baseData = {
      subjectId: subject.id,
      contentStandardId: indicator.contentStandardId,
      indicatorId: indicator.id,
      // 0 = "not yet mapped to exact PDF page". You can later update these.
      pageNumberInPdf: 0,
      figureLabel: null as string | null,
      imagePath,
      altText,
      detailedDescription,
      tags
    };

    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        indicatorId: indicator.id,
        imagePath
      }
    });

    if (existing) {
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: baseData
      });
      console.log(`🔁 Updated media for ${indicatorCode} (${fileName})`);
    } else {
      await prisma.curriculumMedia.create({
        data: baseData
      });
      console.log(`✅ Created media for ${indicatorCode} (${fileName})`);
    }
  }

  console.log('🎉 Done seeding Basic 1 English Language media.');
}

main()
  .catch((err) => {
    console.error('❌ Error seeding Basic 1 English Language media:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
