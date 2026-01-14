import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ExemplarJson = {
  orderIndex: number;
  description: string;
};

type IndicatorJson = {
  code: string;
  description: string;
  orderIndex: number;
  exemplars?: ExemplarJson[];
};

type ContentStandardJson = {
  code: string;
  description: string;
  orderIndex: number;
  indicators?: IndicatorJson[];
};

type SubStrandJson = {
  code: string;
  title?: string;
  description?: string;
  orderIndex: number;

  // normal shape
  contentStandards?: ContentStandardJson[];

  // sometimes corrupted/misplaced nodes end up here; we will auto-correct by code length.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
};

type StrandJson = {
  code: string;
  title?: string;
  description?: string;
  orderIndex: number;
  subStrands?: SubStrandJson[];
};

type CurriculumJson = {
  phase: string;
  level: string;
  subject?: string; // not in DB schema; ignore safely
  name: string;
  slug: string;
  orderIndex: number;
  description?: string;
  strands: StrandJson[];
};

function parts(code: string) {
  return code.split(".").length;
}

function deriveStrandCode(indOrCsOrSsCode: string) {
  // B2.4 from B2.4.2.1.2
  return indOrCsOrSsCode.split(".").slice(0, 2).join(".");
}
function deriveSubStrandCode(indOrCsCode: string) {
  // B2.4.2 from B2.4.2.1.2
  return indOrCsCode.split(".").slice(0, 3).join(".");
}
function deriveContentStandardCode(indCode: string) {
  // B2.4.2.1 from B2.4.2.1.2
  return indCode.split(".").slice(0, 4).join(".");
}

function fallbackTitle(code: string, title?: string, description?: string) {
  return (title?.trim() || description?.trim() || code).slice(0, 250);
}

async function upsertSubject(json: CurriculumJson) {
  return prisma.curriculumSubject.upsert({
    where: { slug: json.slug },
    update: {
      name: json.name,
      phase: json.phase,
      level: json.level,
      orderIndex: json.orderIndex,
      description: json.description ?? "",
    },
    create: {
      name: json.name,
      slug: json.slug,
      phase: json.phase,
      level: json.level,
      orderIndex: json.orderIndex,
      description: json.description ?? "",
    },
  });
}

async function getOrCreateStrand(subjectId: string, strand: StrandJson) {
  const existing = await prisma.curriculumStrand.findFirst({
    where: { subjectId, code: strand.code },
  });

  const data = {
    code: strand.code,
    title: fallbackTitle(strand.code, strand.title, strand.description),
    description: strand.description ?? "",
    orderIndex: strand.orderIndex,
  };

  if (existing) {
    return prisma.curriculumStrand.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.curriculumStrand.create({
    data: {
      ...data,
      subject: { connect: { id: subjectId } },
    },
  });
}

async function getOrCreateSubStrand(strandId: string, ss: { code: string; title?: string; description?: string; orderIndex: number }) {
  const existing = await prisma.curriculumSubStrand.findFirst({
    where: { strandId, code: ss.code },
  });

  const data = {
    code: ss.code,
    title: fallbackTitle(ss.code, ss.title, ss.description),
    description: ss.description ?? "",
    orderIndex: ss.orderIndex,
  };

  if (existing) {
    return prisma.curriculumSubStrand.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.curriculumSubStrand.create({
    data: {
      ...data,
      strand: { connect: { id: strandId } },
    },
  });
}

async function getOrCreateContentStandard(subStrandId: string, cs: ContentStandardJson) {
  const existing = await prisma.curriculumContentStandard.findFirst({
    where: { subStrandId, code: cs.code },
  });

  const data = {
    code: cs.code,
    description: cs.description ?? "",
    orderIndex: cs.orderIndex,
  };

  if (existing) {
    return prisma.curriculumContentStandard.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.curriculumContentStandard.create({
    data: {
      ...data,
      subStrand: { connect: { id: subStrandId } },
    },
  });
}

async function getOrCreateIndicator(contentStandardId: string, ind: IndicatorJson) {
  const existing = await prisma.curriculumIndicator.findFirst({
    where: { contentStandardId, code: ind.code },
  });

  const data = {
    code: ind.code,
    description: ind.description ?? "",
    orderIndex: ind.orderIndex,
  };

  if (existing) {
    return prisma.curriculumIndicator.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.curriculumIndicator.create({
    data: {
      ...data,
      contentStandard: { connect: { id: contentStandardId } },
    },
  });
}

async function upsertExemplars(indicatorId: string, exemplars?: ExemplarJson[]) {
  if (!exemplars?.length) return;

  for (const ex of exemplars) {
    const existing = await prisma.curriculumExemplar.findFirst({
      where: { indicatorId, orderIndex: ex.orderIndex },
    });

    const data = {
      orderIndex: ex.orderIndex,
      description: ex.description ?? "",
    };

    if (existing) {
      await prisma.curriculumExemplar.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.curriculumExemplar.create({
        data: {
          ...data,
          indicator: { connect: { id: indicatorId } },
        },
      });
    }
  }
}

async function mainReal() {
  const seedPath = path.join(__dirname, "curriculum", "basic-2-our-world-and-our-people.json");
  console.log("📖 Loading Basic 2 OWOP curriculum from:", seedPath);

  const raw = fs.readFileSync(seedPath, "utf8");
  const json: CurriculumJson = JSON.parse(raw);

  console.log(`→ Subject: ${json.name} (${json.slug})`);
  console.log(`   Phase/Level: ${json.phase} / ${json.level}`);
  console.log(`   Strands in JSON: ${json.strands?.length ?? 0}\n`);

  const subject = await upsertSubject(json);

  // Build a quick lookup of strands by code (in case JSON repeats a strand block like B2.3)
  const strandByCode = new Map<string, StrandJson>();
  for (const s of json.strands ?? []) {
    if (!strandByCode.has(s.code)) strandByCode.set(s.code, s);
    else {
      // Merge repeated strand blocks gently (append subStrands)
      const prev = strandByCode.get(s.code)!;
      prev.subStrands = [...(prev.subStrands ?? []), ...(s.subStrands ?? [])];
    }
  }

  let strandsCount = 0;
  let subStrandsCount = 0;
  let csCount = 0;
  let indCount = 0;
  let exCount = 0;
  let autoFixed = 0;

  for (const strandJson of strandByCode.values()) {
    const strand = await getOrCreateStrand(subject.id, strandJson);
    strandsCount++;

    const subStrands = strandJson.subStrands ?? [];
    for (const ssJson of subStrands) {
      const p = parts(ssJson.code);

      // ✅ NORMAL: SubStrand is 3 parts like B2.4.2
      if (p === 3) {
        const ss = await getOrCreateSubStrand(strand.id, ssJson);
        subStrandsCount++;

        const contentStandards = ssJson.contentStandards ?? [];
        for (const csJson of contentStandards) {
          const csParts = parts(csJson.code);

          // ✅ NORMAL: ContentStandard is 4 parts like B2.4.2.1
          if (csParts === 4) {
            const cs = await getOrCreateContentStandard(ss.id, csJson);
            csCount++;

            const indicators = csJson.indicators ?? [];
            for (const indJson of indicators) {
              if (parts(indJson.code) !== 5) {
                console.log(`⚠️ Skipping malformed indicator code: ${indJson.code}`);
                continue;
              }
              const ind = await getOrCreateIndicator(cs.id, indJson);
              indCount++;
              const before = exCount;
              await upsertExemplars(ind.id, indJson.exemplars);
              exCount += (indJson.exemplars?.length ?? 0);
              if (exCount > before) {
                // ok
              }
            }
            continue;
          }

          // 🛠️ AUTO-FIX: If a 5-part code appears where CS should be, treat it as an indicator
          if (csParts === 5) {
            autoFixed++;
            const csCode = deriveContentStandardCode(csJson.code);
            const cs = await getOrCreateContentStandard(ss.id, {
              code: csCode,
              description: "(Auto-created content standard from misplaced indicator node)",
              orderIndex: csJson.orderIndex ?? 999,
              indicators: [],
            });
            csCount++;

            const ind = await getOrCreateIndicator(cs.id, {
              code: csJson.code,
              description: csJson.description ?? "(Auto-fixed indicator description)",
              orderIndex: csJson.orderIndex ?? 1,
              exemplars: csJson.indicators?.flatMap((x) => x.exemplars ?? []) ?? [],
            });
            indCount++;

            await upsertExemplars(ind.id, (csJson as any).exemplars ?? []);
            exCount += ((csJson as any).exemplars?.length ?? 0);

            console.log(`🛠️ Auto-fixed misplaced indicator node: ${csJson.code}`);
            continue;
          }

          console.log(`⚠️ Skipping malformed content standard code: ${csJson.code}`);
        }

        continue;
      }

      // 🛠️ AUTO-FIX: If a 4-part code appears where SubStrand should be, treat it as a content standard
      if (p === 4) {
        autoFixed++;
        const ssCode = deriveSubStrandCode(ssJson.code);
        const ss = await getOrCreateSubStrand(strand.id, {
          code: ssCode,
          title: `Auto-created ${ssCode}`,
          description: "(Auto-created sub-strand from misplaced content standard node)",
          orderIndex: ssJson.orderIndex ?? 999,
        });
        subStrandsCount++;

        const cs = await getOrCreateContentStandard(ss.id, {
          code: ssJson.code,
          description: ssJson.description ?? "(Auto-fixed content standard description)",
          orderIndex: ssJson.orderIndex ?? 1,
          indicators: [],
        });
        csCount++;

        console.log(`🛠️ Auto-fixed misplaced content standard node: ${ssJson.code}`);
        continue;
      }

      // 🛠️ AUTO-FIX: If a 5-part code appears where SubStrand should be (YOUR CURRENT BUG), treat it as an indicator
      if (p === 5) {
        autoFixed++;
        const ssCode = deriveSubStrandCode(ssJson.code);
        const csCode = deriveContentStandardCode(ssJson.code);

        const ss = await getOrCreateSubStrand(strand.id, {
          code: ssCode,
          title: `Auto-created ${ssCode}`,
          description: "(Auto-created sub-strand from misplaced indicator node)",
          orderIndex: ssJson.orderIndex ?? 999,
        });
        subStrandsCount++;

        const cs = await getOrCreateContentStandard(ss.id, {
          code: csCode,
          description: "(Auto-created content standard from misplaced indicator node)",
          orderIndex: ssJson.orderIndex ?? 999,
          indicators: [],
        });
        csCount++;

        const ind = await getOrCreateIndicator(cs.id, {
          code: ssJson.code,
          description: ssJson.description ?? "(Auto-fixed indicator description)",
          orderIndex: ssJson.orderIndex ?? 1,
          exemplars: (ssJson as any).exemplars ?? [],
        });
        indCount++;

        await upsertExemplars(ind.id, (ssJson as any).exemplars ?? []);
        exCount += ((ssJson as any).exemplars?.length ?? 0);

        console.log(`🛠️ Auto-fixed misplaced indicator node (was in subStrands): ${ssJson.code}`);
        continue;
      }

      console.log(`⚠️ Skipping malformed sub-strand code: ${ssJson.code}`);
    }
  }

  console.log("\n🎉 Seed complete: Basic 2 OWOP");
  console.log({
    strands: strandsCount,
    subStrands: subStrandsCount,
    contentStandards: csCount,
    indicators: indCount,
    exemplarsTouchedEstimate: exCount,
    autoFixedNodes: autoFixed,
  });
}

async function main() {
  try {
    await mainReal();
  } catch (err) {
    console.error("❌ Error seeding Basic 2 OWOP:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
