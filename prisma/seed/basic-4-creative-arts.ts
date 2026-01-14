// prisma/seed/basic-4-creative-arts.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ✅ ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔁 Auto-discover all Basic 4 Creative Arts part JSON files
const CURRICULUM_DIR = path.join(__dirname, "curriculum");

const partFiles = fs
  .readdirSync(CURRICULUM_DIR)
  .filter(
    (name) =>
      name.toLowerCase().includes("basic-4-creative-arts-part") &&
      name.toLowerCase().endsWith(".json")
  )
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

console.log("📦 Seeding Basic 4 Creative Arts from:", CURRICULUM_DIR);
console.log("🔍 Found part files:", partFiles);

/**
 * 🔒 LOCKED DELEGATE MAP (VERIFIED)
 */
const DELEGATES = {
  curriculumSubject: "curriculumSubject",
  strand: "curriculumStrand",
  subStrand: "curriculumSubStrand",
  contentStandard: "curriculumContentStandard",
  indicator: "curriculumIndicator",
  exemplar: "curriculumExemplar",
} as const;

// -------------------------
// Types
// -------------------------
type ExemplarJSON = { orderIndex: number; description: string };
type IndicatorJSON = {
  code: string;
  description: string;
  orderIndex: number;
  exemplars?: ExemplarJSON[];
};
type ContentStandardJSON = {
  code: string;
  description: string;
  orderIndex: number;
  indicators?: IndicatorJSON[];
};
type SubStrandJSON = {
  code: string;
  title: string;
  description?: string;
  orderIndex: number;
  contentStandards?: ContentStandardJSON[];
};
type StrandJSON = {
  code: string;
  title: string;
  description?: string;
  orderIndex: number;
  subStrands?: SubStrandJSON[];
};
type SubjectJSON = {
  part?: string;
  phase: string;
  level: string;
  subject?: string; // in JSON only
  name: string;
  slug: string;
  orderIndex: number;
  description?: string;
  strands?: StrandJSON[];
};

// -------------------------
// Utils
// -------------------------
function normalizeCode(input: string): string {
  return String(input || "")
    .trim()
    .replace(/\s+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/\.(?=$)/, "")
    .replace(/^\.+/, "");
}

function req(value: any, label: string) {
  if (value === null || value === undefined || String(value).trim() === "") {
    throw new Error(`❌ Missing required field: ${label}`);
  }
}

function listPrismaDelegates(client: any) {
  const keys = Object.keys(client)
    .filter((k) => !k.startsWith("$"))
    .sort();
  console.log("\n🔎 Prisma Client delegates (non-$ keys):");
  console.log(keys);
  console.log("\n✅ Delegates printed.\n");
}

function getDelegate(client: any, key: keyof typeof DELEGATES) {
  const prop = DELEGATES[key];
  const d = client?.[prop];
  if (!d) {
    throw new Error(
      `❌ Prisma delegate missing: client.${String(prop)} (mapped from "${String(
        key
      )}").`
    );
  }
  return d;
}

// -------------------------
// Upserts (NO TRANSACTION)
// -------------------------
async function upsertSubject(p: any, s: SubjectJSON) {
  req(s.slug, "subject.slug");
  req(s.name, "subject.name");
  req(s.phase, "subject.phase");
  req(s.level, "subject.level");

  const curriculumSubject = getDelegate(p, "curriculumSubject");

  const existing = await curriculumSubject.findFirst({
    where: { slug: s.slug },
    select: { id: true },
  });

  // ⚠️ DO NOT write `subject` field — schema doesn’t have it
  const data: any = {
    slug: s.slug,
    name: s.name,
    phase: s.phase,
    level: s.level,
    orderIndex: s.orderIndex ?? 1,
    description: s.description ?? "",
  };

  if (!existing) return curriculumSubject.create({ data });
  return curriculumSubject.update({ where: { id: existing.id }, data });
}

async function upsertStrand(p: any, subjectId: string, strand: StrandJSON) {
  const strandD = getDelegate(p, "strand");
  const code = normalizeCode(strand.code);
  req(code, "strand.code");
  req(strand.title, "strand.title");

  const existing = await strandD.findFirst({
    where: { subjectId, code },
    select: { id: true },
  });

  const data: any = {
    subjectId,
    code,
    title: strand.title,
    description: strand.description ?? "",
    orderIndex: strand.orderIndex ?? 1,
  };

  if (!existing) return strandD.create({ data });
  return strandD.update({ where: { id: existing.id }, data });
}

async function upsertSubStrand(p: any, strandId: string, sub: SubStrandJSON) {
  const subStrandD = getDelegate(p, "subStrand");
  const code = normalizeCode(sub.code);
  req(code, "subStrand.code");
  req(sub.title, "subStrand.title");

  const existing = await subStrandD.findFirst({
    where: { strandId, code },
    select: { id: true },
  });

  const data: any = {
    strandId,
    code,
    title: sub.title,
    description: sub.description ?? "",
    orderIndex: sub.orderIndex ?? 1,
  };

  if (!existing) return subStrandD.create({ data });
  return subStrandD.update({ where: { id: existing.id }, data });
}

async function upsertContentStandard(p: any, subStrandId: string, cs: ContentStandardJSON) {
  const csD = getDelegate(p, "contentStandard");
  const code = normalizeCode(cs.code);
  req(code, "contentStandard.code");
  req(cs.description, "contentStandard.description");

  const existing = await csD.findFirst({
    where: { subStrandId, code },
    select: { id: true },
  });

  const data: any = {
    subStrandId,
    code,
    description: cs.description,
    orderIndex: cs.orderIndex ?? 1,
  };

  if (!existing) return csD.create({ data });
  return csD.update({ where: { id: existing.id }, data });
}

async function upsertIndicator(p: any, contentStandardId: string, ind: IndicatorJSON) {
  const indD = getDelegate(p, "indicator");
  const code = normalizeCode(ind.code);
  req(code, "indicator.code");
  req(ind.description, "indicator.description");

  const existing = await indD.findFirst({
    where: { contentStandardId, code },
    select: { id: true },
  });

  const data: any = {
    contentStandardId,
    code,
    description: ind.description,
    orderIndex: ind.orderIndex ?? 1,
  };

  if (!existing) return indD.create({ data });
  return indD.update({ where: { id: existing.id }, data });
}

async function upsertExemplar(p: any, indicatorId: string, ex: ExemplarJSON) {
  const exD = getDelegate(p, "exemplar");
  req(ex.description, "exemplar.description");

  const orderIndex = Number(ex.orderIndex ?? 1);

  const existing = await exD.findFirst({
    where: { indicatorId, orderIndex },
    select: { id: true },
  });

  const data: any = {
    indicatorId,
    orderIndex,
    description: ex.description,
  };

  if (!existing) return exD.create({ data });
  return exD.update({ where: { id: existing.id }, data });
}

// -------------------------
// Merge parts by slug
// -------------------------
function mergeSubjects(parts: SubjectJSON[]): SubjectJSON[] {
  const map = new Map<string, SubjectJSON>();

  for (const s of parts) {
    req(s.slug, "subject.slug");
    const prev = map.get(s.slug);

    if (!prev) {
      map.set(s.slug, s);
      continue;
    }

    const merged: SubjectJSON = {
      ...prev,
      ...s,
      strands: [...(prev.strands ?? []), ...(s.strands ?? [])].sort((a, b) => {
        const ao = a.orderIndex ?? 0;
        const bo = b.orderIndex ?? 0;
        if (ao !== bo) return ao - bo;
        return normalizeCode(a.code).localeCompare(normalizeCode(b.code));
      }),
    };

    map.set(s.slug, merged);
  }

  return [...map.values()];
}

// -------------------------
// Seed one subject (locked, sequential)
// -------------------------
async function seedOneSubject(subject: SubjectJSON) {
  if (subject.slug !== "basic-4-creative-arts") {
    throw new Error(`❌ Refusing to seed slug="${subject.slug}". Locked to basic-4-creative-arts.`);
  }

  const dbSubject = await upsertSubject(prisma as any, subject);

  for (const strand of subject.strands ?? []) {
    const dbStrand = await upsertStrand(prisma as any, dbSubject.id, strand);

    for (const sub of strand.subStrands ?? []) {
      const dbSub = await upsertSubStrand(prisma as any, dbStrand.id, sub);

      for (const cs of sub.contentStandards ?? []) {
        const dbCS = await upsertContentStandard(prisma as any, dbSub.id, cs);

        for (const ind of cs.indicators ?? []) {
          const dbInd = await upsertIndicator(prisma as any, dbCS.id, ind);

          for (const ex of ind.exemplars ?? []) {
            await upsertExemplar(prisma as any, dbInd.id, ex);
          }
        }
      }
    }
  }
}

// -------------------------
// Main
// -------------------------
async function main() {
  if (process.env.PRINT_DELEGATES === "1") {
    listPrismaDelegates(prisma as any);
    return;
  }

  if (partFiles.length === 0) {
    console.error("❌ No Basic 4 Creative Arts part JSON files found.");
    process.exit(1);
  }

  let parts: SubjectJSON[] = [];

  for (const partFile of partFiles) {
    const partPath = path.join(CURRICULUM_DIR, partFile);
    console.log(`📖 Loading: ${partPath}`);

    const raw = fs.readFileSync(partPath, "utf8");
    const json = JSON.parse(raw);

    if (Array.isArray(json.subjects)) parts = parts.concat(json.subjects as SubjectJSON[]);
    else parts.push(json as SubjectJSON);
  }

  const subjects = mergeSubjects(parts);

  for (const s of subjects) {
    console.log(`🎯 Seeding subject: ${s.slug}`);
    await seedOneSubject(s);
  }

  console.log("✅ DONE: Basic 4 Creative Arts seeded into DB.");
  console.log("🔎 NEXT: export canonical indicator list (id, code) and lock it for media generation.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
