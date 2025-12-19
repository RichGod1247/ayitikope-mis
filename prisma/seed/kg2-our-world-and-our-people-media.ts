// prisma/seed/kg2-our-world-and-our-people-media.ts
//
// Smartly reuse KG1 OWOP media for matching KG2 OWOP indicators.
// Matching is done by "core code" (dropping the K1/K2 prefix).
//
// Run with:
//   npx ts-node prisma/seed/kg2-our-world-and-our-people-media.ts

import { PrismaClient } from "@prisma/client";
import type { CurriculumMedia } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Normalise an indicator code so that KG1 and KG2 equivalents match.
 * Example:
 *  - "K1.1.2.1.1"  -> "1.2.1.1"
 *  - "K2.1.2.1.1"  -> "1.2.1.1"
 */
function coreCode(code: string): string {
  const trimmed = code.trim();
  const parts = trimmed
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) return trimmed;
  return parts.slice(1).join(".");
}

async function main() {
  console.log("🔁 Seeding KG2 OWOP media by smart reuse from KG1…");

  // 1️⃣ Load KG1 + KG2 OWOP subjects
  const kg1Subject = await prisma.curriculumSubject.findUnique({
    where: { slug: "kg1-our-world-and-our-people" },
  });
  if (!kg1Subject) {
    throw new Error(
      "KG1 Our World and Our People subject not found (slug=kg1-our-world-and-our-people)"
    );
  }

  const kg2Subject = await prisma.curriculumSubject.findUnique({
    where: { slug: "kg2-our-world-and-our-people" },
  });
  if (!kg2Subject) {
    throw new Error(
      "KG2 Our World and Our People subject not found (slug=kg2-our-world-and-our-people)"
    );
  }

  console.log(
    `→ Subjects loaded: KG1(id=${kg1Subject.id}), KG2(id=${kg2Subject.id})`
  );

  // 2️⃣ Load ONLY KG1 + KG2 OWOP indicators via curriculum tree
  const [kg1Indicators, kg2Indicators] = await Promise.all([
    prisma.curriculumIndicator.findMany({
      where: {
        code: { startsWith: "K1." },
        contentStandard: {
          subStrand: {
            strand: {
              subjectId: kg1Subject.id,
            },
          },
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.curriculumIndicator.findMany({
      where: {
        code: { startsWith: "K2." },
        contentStandard: {
          subStrand: {
            strand: {
              subjectId: kg2Subject.id,
            },
          },
        },
      },
      orderBy: { code: "asc" },
    }),
  ]);

  console.log(
    `→ Indicators loaded: KG1=${kg1Indicators.length}, KG2=${kg2Indicators.length}`
  );

  // 3️⃣ Build a map from "core code" -> KG1 indicator id
  const kg1ByCoreCode = new Map<string, string>();
  for (const ind of kg1Indicators) {
    const key = coreCode(ind.code);
    if (!key) continue;
    kg1ByCoreCode.set(key, ind.id);
  }

  // 4️⃣ Pair KG2 indicators to KG1 indicators by core code
  const indicatorPairs: { kg1IndicatorId: string; kg2IndicatorId: string }[] =
    [];

  for (const ind2 of kg2Indicators) {
    const key = coreCode(ind2.code);
    if (!key) continue;
    const matchKg1Id = kg1ByCoreCode.get(key);
    if (matchKg1Id) {
      indicatorPairs.push({
        kg1IndicatorId: matchKg1Id,
        kg2IndicatorId: ind2.id,
      });
    }
  }

  if (!indicatorPairs.length) {
    console.warn(
      "⚠️ No KG1/KG2 indicator matches by core code. Nothing to reuse."
    );
    return;
  }

  console.log(
    `→ Matched KG1↔KG2 indicators by core code: ${indicatorPairs.length}`
  );

  const kg1IndicatorIds = indicatorPairs.map((p) => p.kg1IndicatorId);
  const kg2IndicatorIds = indicatorPairs.map((p) => p.kg2IndicatorId);

  // 5️⃣ Load ALL media attached to those KG1 indicators, scoped to KG1 OWOP via the indicator tree
  const kg1Media = await prisma.curriculumMedia.findMany({
    where: {
      indicatorId: { in: kg1IndicatorIds },
      indicator: {
        contentStandard: {
          subStrand: {
            strand: {
              subjectId: kg1Subject.id,
            },
          },
        },
      },
    },
  });

  console.log(`→ KG1 media records to reuse: ${kg1Media.length}`);

  if (!kg1Media.length) {
    console.warn(
      "⚠️ No KG1 media found for matched indicators. Recheck KG1 OWOP media seed."
    );
  }

  // Index KG1 media by indicatorId
  const mediaByIndicator = new Map<string, CurriculumMedia[]>();
  for (const media of kg1Media) {
    if (!media.indicatorId) continue;
    const list = mediaByIndicator.get(media.indicatorId) ?? [];
    list.push(media);
    mediaByIndicator.set(media.indicatorId, list);
  }

  // 6️⃣ Clear existing KG2 media for those indicators (only for KG2 OWOP)
  const deleteResult = await prisma.curriculumMedia.deleteMany({
    where: {
      subjectId: kg2Subject.id,
      indicatorId: { in: kg2IndicatorIds },
    },
  });

  console.log(
    `🧹 Deleted existing KG2 media rows for matched indicators: ${deleteResult.count}`
  );

  // 7️⃣ Clone KG1 media rows into KG2 indicators
  let created = 0;

  for (const pair of indicatorPairs) {
    const originals = mediaByIndicator.get(pair.kg1IndicatorId);
    if (!originals || !originals.length) continue;

    for (const original of originals) {
      await prisma.curriculumMedia.create({
        data: {
          subjectId: kg2Subject.id,
          indicatorId: pair.kg2IndicatorId, // safety: use kg2 id
          contentStandardId: original.contentStandardId,
          exemplarId: original.exemplarId,
          pageNumberInPdf: original.pageNumberInPdf,
          figureLabel: original.figureLabel,
          imagePath: original.imagePath,
          altText: original.altText,
          detailedDescription: original.detailedDescription,
          tags: original.tags,
        },
      });
      created++;
    }
  }

  console.log("✅ Finished syncing KG2 Our World and Our People media");
  console.log(`   Matched indicators: ${indicatorPairs.length}`);
  console.log(`   KG2 media records created: ${created}`);
}

main()
  .catch((err) => {
    console.error("❌ Error while seeding KG2 OWOP media");
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
