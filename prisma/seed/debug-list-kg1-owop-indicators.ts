// prisma/seed/debug-list-kg1-owop-indicators.ts
//
// Helper script to list all CurriculumIndicator codes
// for the subject "KG1 Our World and Our People"
// so we can see what actually exists in the database.
//
// Run with:
//   npx ts-node prisma/seed/debug-list-kg1-owop-indicators.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Listing indicators for KG1 Our World and Our People…");

  // 1. Find the subject by slug (the same slug you used in JSON)
  const subjectSlug = "kg1-our-world-and-our-people";

  const subject = await prisma.curriculumSubject.findFirst({
    where: { slug: subjectSlug },
  });

  if (!subject) {
    console.error(
      `❌ No CurriculumSubject found with slug='${subjectSlug}'.`
    );
    process.exit(1);
  }

  console.log(
    `✅ Found subject: ${subject.name} (id=${subject.id}, slug=${subject.slug})`
  );

  // 2. Find all indicators under that subject
  const indicators = await prisma.curriculumIndicator.findMany({
    where: {
      contentStandard: {
        subStrand: {
          strand: {
            subjectId: subject.id,
          },
        },
      },
    },
    include: {
      contentStandard: {
        include: {
          subStrand: {
            include: {
              strand: true,
            },
          },
        },
      },
    },
    orderBy: {
      code: "asc",
    },
  });

  console.log(`\n📊 Total indicators found for this subject: ${indicators.length}`);

  if (indicators.length === 0) {
    console.log(
      "⚠️ There are NO CurriculumIndicator rows linked to this subject. " +
        "You likely haven't seeded the KG1 OWOP curriculum structure (strands/substrands/contentStandards/indicators) yet."
    );
    return;
  }

  console.log("\nFirst 50 indicators (code + strand/subStrand/contentStandard):\n");

  const slice = indicators.slice(0, 50);
  for (const ind of slice) {
    const cs = ind.contentStandard;
    const ss = cs?.subStrand;
    const st = ss?.strand;

    console.log(
      `- indicator.id=${ind.id}, code=${ind.code}, ` +
        `strandCode=${st?.code ?? "?"}, subStrandCode=${ss?.code ?? "?"}, contentStandardCode=${cs?.code ?? "?"}`
    );
  }

  console.log(
    "\n🧾 TIP: Compare these indicator.code values to the ones in kg1-owop-media.json " +
      "(e.g. K1.1.1.1.1, K1.2.1.1.1, etc.) to see if they actually exist or are different."
  );
}

main()
  .catch((err) => {
    console.error("❌ Error in debug script:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
