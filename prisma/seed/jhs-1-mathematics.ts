import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

/**
 * JSON type shapes based on jhs-1-mathematics.json
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

// Ensure non-empty description where DB requires it
function safeDesc(value: string | undefined, fallback: string): string {
  if (value && value.trim().length > 0) return value;
  return fallback;
}

async function main() {
  const filePath = path.join(
    process.cwd(),
    'prisma',
    'seed',
    'curriculum',
    'jhs-1-mathematics.json'
  );

  console.log('📖 Loading JHS 1 Mathematics curriculum from:', filePath);

  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw) as JsonSubject;

  console.log('→ Subject:', data.name, `(${data.slug})`);
  console.log('   Phase/Level:', data.phase, '/', data.level);
  console.log('   Strands in JSON:', data.strands?.length ?? 0);

  // 1️⃣ Clear any existing record for this slug to keep seeding idempotent
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

  // 2️⃣ Create subject with full nested tree
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

  console.log('✅ Seeded JHS 1 Mathematics with id:', subject.id);
  console.log('   Strands created from JSON:', data.strands?.length ?? 0);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding JHS 1 Mathematics:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
