// prisma/scripts/normalise-b2-creative-arts-codes.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const subjectSlug = 'basic-2-creative-arts';

  console.log(`🔎 Loading subject ${subjectSlug} ...`);

  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: subjectSlug },
    include: {
      strands: {
        orderBy: { orderIndex: 'asc' },
        include: {
          subStrands: {
            orderBy: { orderIndex: 'asc' },
            include: {
              contentStandards: {
                orderBy: { orderIndex: 'asc' },
                include: {
                  indicators: {
                    orderBy: { orderIndex: 'asc' },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!subject) {
    console.error(`❌ Could not find CurriculumSubject with slug=${subjectSlug}`);
    process.exit(1);
  }

  console.log(
    `✅ Found subject ${subject.name} (slug=${subject.slug}) with ${subject.strands.length} strands.`,
  );

  const updates: any[] = [];

  // Strand codes: B2.1, B2.2, ...
  subject.strands.forEach((strand, strandIndex) => {
    const strandCode = `B2.${strandIndex + 1}`;
    if (strand.code !== strandCode) {
      console.log(`→ Strand ${strand.code}  ➜  ${strandCode}`);
      updates.push(
        prisma.curriculumStrand.update({
          where: { id: strand.id },
          data: { code: strandCode },
        }),
      );
    }

    // Sub-strands: B2.1.1, B2.1.2, ...
    strand.subStrands.forEach((subStrand, subIndex) => {
      const subCode = `B2.${strandIndex + 1}.${subIndex + 1}`;
      if (subStrand.code !== subCode) {
        console.log(`   → Sub-strand ${subStrand.code}  ➜  ${subCode}`);
        updates.push(
          prisma.curriculumSubStrand.update({
            where: { id: subStrand.id },
            data: { code: subCode },
          }),
        );
      }

      // Content standards: B2.1.1.1, B2.1.1.2, ...
      subStrand.contentStandards.forEach((cs, csIndex) => {
        const csCode = `B2.${strandIndex + 1}.${subIndex + 1}.${csIndex + 1}`;
        if (cs.code !== csCode) {
          console.log(`      → ContentStandard ${cs.code}  ➜  ${csCode}`);
          updates.push(
            prisma.curriculumContentStandard.update({
              where: { id: cs.id },
              data: { code: csCode },
            }),
          );
        }

        // Indicators: B2.1.1.1.1, B2.1.1.1.2, ...
        cs.indicators.forEach((ind, indIndex) => {
          const indCode = `B2.${strandIndex + 1}.${subIndex + 1}.${csIndex + 1}.${indIndex + 1}`;
          if (ind.code !== indCode) {
            console.log(`         → Indicator ${ind.code}  ➜  ${indCode}`);
            updates.push(
              prisma.curriculumIndicator.update({
                where: { id: ind.id },
                data: { code: indCode },
              }),
            );
          }
        });
      });
    });
  });

  if (!updates.length) {
    console.log('✅ Nothing to normalise; codes already in B2.x.x.x.x format.');
    return;
  }

  console.log(`\n💾 Applying ${updates.length} code updates in a transaction...`);
  await prisma.$transaction(updates);
  console.log('🎉 Done normalising B2 Creative Arts codes to B2.1.x.x.x scheme.');
}

main()
  .catch((err) => {
    console.error('❌ Error normalising B2 Creative Arts codes:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
