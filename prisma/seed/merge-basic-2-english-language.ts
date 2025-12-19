import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

type Indicator = {
  code: string;
  description: string;
  orderIndex: number;
  exemplars?: any[];
};

type ContentStandard = {
  code: string;
  description: string;
  orderIndex: number;
  indicators?: Indicator[];
};

type SubStrand = {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  contentStandards?: ContentStandard[];
};

type Strand = {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  subStrands?: SubStrand[];
};

type Subject = {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description: string;
  strands: Strand[];
};

type RawPart = {
  subjects: Subject[];
};

// --- Robust ESM __dirname (works nicely on Windows) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = __dirname;

function loadPart(filename: string): RawPart {
  const fullPath = path.join(BASE_DIR, "raw", filename);
  // For debugging if needed:
  // console.log("Loading:", fullPath);
  const raw = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(raw) as RawPart;
}

function mergeSubjects(parts: RawPart[]): Subject {
  if (!parts.length) {
    throw new Error("No parts provided for Basic 2 English merge");
  }

  // Deep clone first subject as base
  const base: Subject = JSON.parse(JSON.stringify(parts[0].subjects[0]));

  const strandByCode = new Map<string, Strand>();
  for (const strand of base.strands || []) {
    strandByCode.set(strand.code, strand);
  }

  for (const part of parts.slice(1)) {
    const subj = part.subjects[0];
    for (const strand of subj.strands || []) {
      const existingStrand = strandByCode.get(strand.code);

      if (!existingStrand) {
        // Whole new strand
        base.strands.push(strand);
        strandByCode.set(strand.code, strand);
        continue;
      }

      // Merge subStrands by code (no duplication)
      existingStrand.subStrands ??= [];
      const existingSubByCode = new Map<string, SubStrand>(
        existingStrand.subStrands.map((ss) => [ss.code, ss])
      );

      for (const sub of strand.subStrands || []) {
        if (!existingSubByCode.has(sub.code)) {
          existingStrand.subStrands.push(sub);
          existingSubByCode.set(sub.code, sub);
        }
      }
    }
  }

  // Sort strands and subStrands by orderIndex
  base.strands.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  for (const strand of base.strands) {
    if (strand.subStrands) {
      strand.subStrands.sort(
        (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
      );
    }
  }

  return base;
}

async function main() {
  const filenames = [
    "basic-2-english-language-part-1.json",
    "basic-2-english-language-part-2.json",
    "basic-2-english-language-part-3.json",
    "basic-2-english-language-part-4.json",
  ];

  const parts = filenames.map(loadPart);
  const merged = mergeSubjects(parts);

  const outPath = path.join(
    BASE_DIR,
    "curriculum",
    "basic-2-english-language.json"
  );

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), "utf8");

  console.log("✅ Merged Basic 2 English →", outPath);
  console.log("   Total strands:", merged.strands.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
