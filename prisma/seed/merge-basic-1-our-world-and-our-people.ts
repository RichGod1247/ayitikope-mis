import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
  exemplars: ExemplarJson[];
};

type ContentStandardJson = {
  code: string;
  description: string;
  orderIndex: number;
  indicators: IndicatorJson[];
};

type SubStrandJson = {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  contentStandards: ContentStandardJson[];
};

type StrandJson = {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  subStrands: SubStrandJson[];
};

type CurriculumSubjectCoreJson = {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description: string;
  strands: StrandJson[];
};

type CurriculumSubjectPartJson = CurriculumSubjectCoreJson & {
  part?: string;
};

const PART_FILES = [
  "basic-1-our-world-and-our-people-part-1.json",
  "basic-1-our-world-and-our-people-part-2.json",
];

async function loadPart(filename: string): Promise<CurriculumSubjectPartJson> {
  const fullPath = path.join(__dirname, "raw", filename);
  const raw = await fs.readFile(fullPath, "utf8");
  const parsed: any = JSON.parse(raw);

  // Handle both shapes:
  // 1) { part, phase, level, subject, name, slug, strands: [...] }
  // 2) { part, subjects: [ { phase, level, subject, name, slug, strands: [...] } ] }
  let subject: any;

  if (Array.isArray(parsed.subjects) && parsed.subjects.length > 0) {
    subject = parsed.subjects[0];
  } else {
    subject = parsed;
  }

  const result: CurriculumSubjectPartJson = {
    phase: subject.phase,
    level: subject.level,
    subject: subject.subject,
    name: subject.name,
    slug: subject.slug,
    orderIndex: subject.orderIndex,
    description: subject.description,
    strands: subject.strands ?? [],
    part: parsed.part,
  };

  console.log(
    `   Loaded ${filename} → ${result.slug}, strands: ${result.strands.length}, part: ${result.part}`
  );

  return result;
}

async function main() {
  console.log("🔄 Merging Basic 1 Our World and Our People parts...");

  const parts = await Promise.all(PART_FILES.map(loadPart));
  const [first, ...rest] = parts;

  // sanity check
  for (const p of rest) {
    if (p.slug !== first.slug) {
      throw new Error(
        `Slug mismatch between parts: "${first.slug}" vs "${p.slug}"`
      );
    }
  }

  const allStrands: StrandJson[] = parts.flatMap((p) => p.strands ?? []);

  const mergedStrands = allStrands.sort((a, b) => {
    const oa = a.orderIndex ?? 0;
    const ob = b.orderIndex ?? 0;
    return oa - ob;
  });

  const merged: CurriculumSubjectCoreJson = {
    phase: first.phase,
    level: first.level,
    subject: first.subject,
    name: first.name,
    slug: first.slug,
    orderIndex: first.orderIndex,
    description: first.description,
    strands: mergedStrands,
  };

  const outPath = path.join(
    __dirname,
    "curriculum",
    "basic-1-our-world-and-our-people.json"
  );

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf8");

  console.log(
    `✅ Merged Basic 1 OWOP → ${outPath}\n   Total strands: ${mergedStrands.length}`
  );
}

main().catch((err) => {
  console.error("❌ Error merging Basic 1 Our World and Our People:", err);
  process.exit(1);
});
