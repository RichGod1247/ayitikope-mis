import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = "basic-2-our-world-and-our-people";

function key(v: string | null | undefined) {
  return (v ?? "__NULL__").trim();
}

function findDuplicates<T>(items: T[], keyFn: (x: T) => string) {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = keyFn(it);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([k, arr]) => ({ key: k, count: arr.length, sampleIds: arr.slice(0, 5).map((x: any) => x.id) }));
}

async function main() {
  const subj = await prisma.curriculumSubject.findUnique({
    where: { slug: SLUG },
    select: { id: true, name: true },
  });

  if (!subj) throw new Error(`❌ CurriculumSubject not found for slug: ${SLUG}`);

  console.log(`🔎 Checking duplicates for: ${subj.name} (${SLUG})`);
  console.log(`   subjectId: ${subj.id}\n`);

  // Strands
  const strands = await prisma.curriculumStrand.findMany({
    where: { subjectId: subj.id },
    select: { id: true, code: true, title: true },
  });
  const strandDups = findDuplicates(strands, (s) => key(s.code));

  // SubStrands
  const subStrands = await prisma.curriculumSubStrand.findMany({
    where: { strand: { subjectId: subj.id } },
    select: { id: true, code: true, title: true, strandId: true },
  });
  const subStrandDups = findDuplicates(subStrands, (ss) => `${ss.strandId}::${key(ss.code)}`);

  // Content Standards
  const contentStandards = await prisma.curriculumContentStandard.findMany({
    where: { subStrand: { strand: { subjectId: subj.id } } },
    select: { id: true, code: true, subStrandId: true },
  });
  const csDups = findDuplicates(contentStandards, (cs) => `${cs.subStrandId}::${key(cs.code)}`);

  // Indicators
  const indicators = await prisma.curriculumIndicator.findMany({
    where: { contentStandard: { subStrand: { strand: { subjectId: subj.id } } } },
    select: { id: true, code: true, contentStandardId: true },
  });
  const indDups = findDuplicates(indicators, (i) => `${i.contentStandardId}::${key(i.code)}`);

  console.log("✅ Strand duplicates:", strandDups.length);
  for (const d of strandDups) console.log("  -", d.key, "x", d.count, "sampleIds:", d.sampleIds.join(", "));

  console.log("\n✅ SubStrand duplicates:", subStrandDups.length);
  for (const d of subStrandDups) console.log("  -", d.key, "x", d.count, "sampleIds:", d.sampleIds.join(", "));

  console.log("\n✅ ContentStandard duplicates:", csDups.length);
  for (const d of csDups) console.log("  -", d.key, "x", d.count, "sampleIds:", d.sampleIds.join(", "));

  console.log("\n✅ Indicator duplicates:", indDups.length);
  for (const d of indDups) console.log("  -", d.key, "x", d.count, "sampleIds:", d.sampleIds.join(", "));

  console.log("\n🎉 Duplicate scan complete.");
}

main()
  .catch((e) => {
    console.error("❌ Duplicate scan failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
