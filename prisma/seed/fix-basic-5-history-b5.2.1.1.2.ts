// @ts-nocheck
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SUBJECT_SLUG = "basic-5-history";
const CS_CODE = "B5.2.1.1";
const ANCHOR_IND = "B5.2.1.1.1";

const TARGET_IND = "B5.2.1.1.2";
const TARGET_DESC = "Describe some ancient towns in Ghana.";
const TARGET_ORDER = 2;

async function main() {
  // Find the exact ContentStandard instance that already contains the anchor indicator (.1.1)
  const cs = await prisma.curriculumContentStandard.findFirst({
    where: {
      code: CS_CODE,
      subStrand: { strand: { subject: { slug: SUBJECT_SLUG } } },
      indicators: { some: { code: ANCHOR_IND } },
    },
    select: { id: true, code: true },
  });

  if (!cs) {
    throw new Error(
      `Could not resolve ContentStandard ${CS_CODE} for ${SUBJECT_SLUG} with anchor ${ANCHOR_IND}. Duplicates likely broke the chain.`
    );
  }

  const existing = await prisma.curriculumIndicator.findFirst({
    where: { contentStandardId: cs.id, code: TARGET_IND },
    select: { id: true },
  });

  if (existing) {
    await prisma.curriculumIndicator.update({
      where: { id: existing.id },
      data: { description: TARGET_DESC, orderIndex: TARGET_ORDER },
    });
    console.log(`✅ Updated existing ${TARGET_IND} under cs=${cs.id}`);
    return;
  }

  const created = await prisma.curriculumIndicator.create({
    data: {
      contentStandardId: cs.id,
      code: TARGET_IND,
      description: TARGET_DESC,
      orderIndex: TARGET_ORDER,
    },
    select: { id: true },
  });

  console.log(`✅ Created ${TARGET_IND} under cs=${cs.id} (id=${created.id})`);
}

main()
  .catch((e) => {
    console.error("❌ Fix failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
