import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

/**
 * JSON shapes based on basic-2-physical-education.json
 */

interface JsonExemplar {
  orderIndex?: number;
  description?: string;
}

interface JsonIndicator {
  code: string;
  orderIndex?: number;
  description?: string;
  exemplars?: JsonExemplar[];
}

interface JsonContentStandard {
  code: string;
  orderIndex?: number;
  description?: string;
  indicators?: JsonIndicator[];
}

interface JsonSubStrand {
  code: string;
  title?: string;
  orderIndex?: number;
  description?: string;
  contentStandards?: JsonContentStandard[];
}

interface JsonStrand {
  code: string;
  title?: string;
  orderIndex?: number;
  description?: string;
  subStrands?: JsonSubStrand[];
}

interface JsonSubject {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description?: string;
  strands?: JsonStrand[];
}

// Helper: always return a non-empty string for required description fields
function safeDesc(value: string | undefined, fallback: string): string {
  if (value && value.trim().length > 0) return value;
  return fallback;
}

async function main() {
  // Use process.cwd() so it works cleanly with ts-node / ESM
  const filePath = path.join(
    process.cwd(),
    'prisma',
    'seed',
    'curriculum',
    'basic-2-physical-education.json'
  );

  console.log('📖 Loading Basic 2 Physical Education curriculum from:', filePath);

  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw) as JsonSubject;

  console.log('→ Subject:', data.name, `(${data.slug})`);
  console.log('   Phase/Level:', data.phase, '/', data.level);
  console.log('   Strands in JSON:', data.strands?.length ?? 0);

  // 1️⃣ Clear existing subject tree (by slug) to avoid duplicates
  try {
    await prisma.curriculumSubject.delete({
      where: { slug: data.slug },
    });
    console.log('🧹 Deleted existing curriculumSubject with slug:', data.slug);
  } catch {
    console.log(
      'ℹ️ No existing curriculumSubject to delete for slug:',
      data.slug
    );
  }

  // 2️⃣ Create subject + nested strands/subStrands/contentStandards/indicators/exemplars
  const subject = await prisma.curriculumSubject.create({
    data: {
      phase: data.phase,
      level: data.level,
      name: data.name,
      slug: data.slug,
      orderIndex: data.orderIndex,
      description: data.description ?? null,

      strands: {
        create: (data.strands ?? []).map((strand, sIdx) => ({
          code: strand.code,
          title: strand.title ?? strand.code,
          orderIndex: strand.orderIndex ?? sIdx + 1,
          description: strand.description ?? null,

          subStrands: {
            create: (strand.subStrands ?? []).map((sub, subIdx) => ({
              code: sub.code,
              title: sub.title ?? sub.code,
              orderIndex: sub.orderIndex ?? subIdx + 1,
              description: sub.description ?? null,

              contentStandards: {
                create: (sub.contentStandards ?? []).map((cs, csIdx) => ({
                  code: cs.code,
                  description: safeDesc(
                    cs.description,
                    `Content standard ${cs.code}`
                  ),
                  orderIndex: cs.orderIndex ?? csIdx + 1,

                  indicators: {
                    create: (cs.indicators ?? []).map((ind, indIdx) => ({
                      code: ind.code,
                      description: safeDesc(
                        ind.description,
                        `Indicator ${ind.code}`
                      ),
                      orderIndex: ind.orderIndex ?? indIdx + 1,

                      exemplars: {
                        create: (ind.exemplars ?? []).map((ex, exIdx) => ({
                          orderIndex: ex.orderIndex ?? exIdx + 1,
                          description: ex.description ?? '',
                        })),
                      },
                    })),
                  },
                })),
              },
            })),
          },
        })),
      },
    },
  });

  console.log('✅ Seeded Basic 2 Physical Education with id:', subject.id);
  console.log('   Strands created from JSON:', data.strands?.length ?? 0);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding Basic 2 Physical Education:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
