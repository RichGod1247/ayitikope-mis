import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Types for the per-part JSON (they all have "part" + "subjects")
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

type CurriculumSubjectJson = {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description: string;
  strands: StrandJson[];
};

type PartFileJson = {
  part: string; // "1/4", "2/4", ...
  subjects: CurriculumSubjectJson[];
};

async function loadPart(
  partNumber: number,
  rawDir: string
): Promise<PartFileJson> {
  const filePath = path.join(
    rawDir,
    `basic-3-english-language-part-${partNumber}.json`
  );

  const raw = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(raw) as PartFileJson;

  if (!json.subjects || json.subjects.length === 0) {
    throw new Error(`Part ${partNumber} has no subjects array or it is empty`);
  }

  return json;
}

async function main() {
  // ESM-safe __dirname
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // prisma/seed/raw
  const rawDir = path.join(__dirname, "raw");

  // Load all four parts
  const partNumbers = [1, 2, 3, 4];
  const parts = await Promise.all(partNumbers.map((n) => loadPart(n, rawDir)));

  // For now we know there is only one subject in each part → Basic 3 English Language
  const firstSubject = parts[0].subjects[0];

  // Sanity-check: ensure all parts refer to the same subject slug
  for (let i = 1; i < parts.length; i++) {
    const subj = parts[i].subjects[0];
    if (subj.slug !== firstSubject.slug) {
      throw new Error(
        `Slug mismatch between part 1 (${firstSubject.slug}) and part ${
          i + 1
        } (${subj.slug})`
      );
    }
  }

  // Merge strands from all parts
  const mergedStrands: StrandJson[] = [];

  for (const part of parts) {
    const subj = part.subjects[0];
    for (const strand of subj.strands) {
      mergedStrands.push(strand);
    }
  }

  // Optional: sort strands by orderIndex (or by code as fallback)
  mergedStrands.sort((a, b) => {
    const ao = a.orderIndex ?? 0;
    const bo = b.orderIndex ?? 0;
    if (ao !== bo) return ao - bo;
    return a.code.localeCompare(b.code);
  });

  const mergedSubject: CurriculumSubjectJson = {
    phase: firstSubject.phase,
    level: firstSubject.level,
    subject: firstSubject.subject,
    name: firstSubject.name,
    slug: firstSubject.slug,
    orderIndex: firstSubject.orderIndex,
    description: firstSubject.description,
    strands: mergedStrands,
  };

  const outDir = path.join(__dirname, "curriculum");
  await fs.mkdir(outDir, { recursive: true });

  const outPath = path.join(outDir, "basic-3-english-language.json");
  await fs.writeFile(
    outPath,
    JSON.stringify({ subjects: [mergedSubject] }, null, 2),
    "utf8"
  );

  console.log(`✅ Merged Basic 3 English → ${outPath}`);
  console.log(`   Total strands: ${mergedStrands.length}`);
}

main().catch((err) => {
  console.error("❌ Error merging Basic 3 English Language:", err);
  process.exit(1);
});
