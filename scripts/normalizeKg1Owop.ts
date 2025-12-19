import fs from "fs";
import path from "path";

// ---------- Type helpers (to keep things tidy) ----------
type Exemplar = {
  orderIndex: number;
  description: string;
};

type Indicator = {
  code: string;
  description: string;
  orderIndex: number;
  exemplars?: Exemplar[];
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

type Curriculum = {
  phase: string;
  level: string;
  name: string;
  slug: string;
  orderIndex: number;
  description: string;
  strands: Strand[];
};

// Instead of __dirname, use the project root:
// process.cwd() = "C:/Users/OWNER/Documents/ayitikope-mis"
const RAW_INPUT_PATH = path.join(process.cwd(), "data", "kg1-owop.raw.json");
const OUTPUT_PATH = path.join(
  process.cwd(),
  "data",
  "kg1-owop.normalized.json"
);

// ---------- Load the raw JSON from data/kg1-owop.raw.json ----------
function loadCurriculum(): Curriculum {
  console.log("📥 Reading KG1 OWOP curriculum from:", RAW_INPUT_PATH);
  const text = fs.readFileSync(RAW_INPUT_PATH, "utf8");
  return JSON.parse(text);
}

// ---------- Fix obvious code mistakes (like K1.3.1.5) ----------
function fixIndicatorCodes(curriculum: Curriculum): Curriculum {
  let fixes = 0;

  for (const strand of curriculum.strands ?? []) {
    for (const sub of strand.subStrands ?? []) {
      for (const cs of sub.contentStandards ?? []) {
        for (const ind of cs.indicators ?? []) {
          // Known wrong code inside "I am a wonderful and Unique creation"
          if (ind.code === "K1.3.1.5") {
            console.log(
              "🔧 Fixing indicator code: K1.3.1.5 → K1.1.1.1.5 at",
              strand.code,
              sub.code,
              cs.code
            );
            ind.code = "K1.1.1.1.5";
            fixes++;
          }
        }
      }
    }
  }

  console.log(`🔧 Total indicator code fixes: ${fixes}`);
  return curriculum;
}

// ---------- Keep everything ordered nicely by orderIndex ----------
function sortByOrderIndex(curriculum: Curriculum): Curriculum {
  const byOrder = <T extends { orderIndex?: number }>(arr?: T[]): T[] | undefined => {
    if (!arr) return arr;
    return [...arr].sort(
      (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
    );
  };

  curriculum.strands = byOrder(curriculum.strands) ?? [];

  for (const strand of curriculum.strands) {
    strand.subStrands = byOrder(strand.subStrands) ?? [];

    for (const sub of strand.subStrands ?? []) {
      sub.contentStandards = byOrder(sub.contentStandards) ?? [];

      for (const cs of sub.contentStandards ?? []) {
        cs.indicators = byOrder(cs.indicators) ?? [];

        for (const ind of cs.indicators ?? []) {
          ind.exemplars = byOrder(ind.exemplars) ?? [];
        }
      }
    }
  }

  return curriculum;
}

// ---------- Main runner ----------
function main() {
  try {
    const curriculum = loadCurriculum();
    const fixed = fixIndicatorCodes(curriculum);
    const sorted = sortByOrderIndex(fixed);

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2), "utf8");
    console.log("✅ Normalized KG1 OWOP saved to:", OUTPUT_PATH);
  } catch (err) {
    console.error("❌ Error while normalizing KG1 OWOP:", err);
    process.exit(1);
  }
}

main();
