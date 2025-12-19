// scripts/normalizeKg1Mathematics.ts
import fs from "fs";
import path from "path";

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

type SubjectChunk = {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex?: number;
  description: string;
  strands: StrandJson[];
};

type RawInput = SubjectChunk | SubjectChunk[];

function ensureArray(raw: RawInput): SubjectChunk[] {
  return Array.isArray(raw) ? raw : [raw];
}

function sortByOrderThenCode<T extends { orderIndex?: number; code?: string }>(
  arr: T[],
): T[] {
  return [...arr].sort((a, b) => {
    const ao = a.orderIndex ?? 0;
    const bo = b.orderIndex ?? 0;
    if (ao !== bo) return ao - bo;

    const ac = a.code ?? "";
    const bc = b.code ?? "";
    return ac.localeCompare(bc);
  });
}

function normalize() {
  const rawPath = path.join(
    process.cwd(),
    "data",
    "kg1-mathematics.raw.json",
  );

  if (!fs.existsSync(rawPath)) {
    console.error(
      `❌ Could not find data/kg1-mathematics.raw.json. Make sure you saved the Gemini outputs there.`,
    );
    process.exit(1);
  }

  const rawStr = fs.readFileSync(rawPath, "utf8");
  const rawJson: RawInput = JSON.parse(rawStr);
  const chunks = ensureArray(rawJson);

  if (chunks.length === 0) {
    console.error("❌ No chunks found in raw KG1 Mathematics JSON.");
    process.exit(1);
  }

  // Use the first chunk as the "master" for subject metadata
  const first = chunks[0];

  const phase = first.phase;
  const level = first.level;
  const subject = first.subject;
  const name = first.name;
  const slug = first.slug;
  const orderIndex = first.orderIndex ?? 0;
  const description = first.description;

  // Merge strands by code
  const strandMap = new Map<string, StrandJson>();

  for (const chunk of chunks) {
    if (
      chunk.phase !== phase ||
      chunk.level !== level ||
      chunk.subject !== subject
    ) {
      console.warn(
        `⚠️ Found chunk with mismatched phase/level/subject:`,
        chunk.phase,
        chunk.level,
        chunk.subject,
      );
    }

    for (const s of chunk.strands) {
      const existing = strandMap.get(s.code);
      if (!existing) {
        strandMap.set(s.code, s);
      } else {
        // If a strand appears twice, merge its subStrands by code
        const subMap = new Map<string, SubStrandJson>();

        for (const ss of existing.subStrands) {
          subMap.set(ss.code, ss);
        }
        for (const ss of s.subStrands) {
          if (!subMap.has(ss.code)) {
            subMap.set(ss.code, ss);
          } else {
            // If even subStrands repeat, just keep the first and ignore duplicates.
            console.warn(
              `⚠️ Duplicate subStrand code ${ss.code} under strand ${s.code} – keeping the first definition.`,
            );
          }
        }

        existing.subStrands = Array.from(subMap.values());
        strandMap.set(s.code, existing);
      }
    }
  }

  // Sort strands, subStrands, contentStandards, indicators, exemplars
  const normalizedStrands: StrandJson[] = sortByOrderThenCode(
    Array.from(strandMap.values()),
  ).map((strand) => ({
    ...strand,
    subStrands: sortByOrderThenCode(strand.subStrands).map((sub) => ({
      ...sub,
      contentStandards: sortByOrderThenCode(
        sub.contentStandards,
      ).map((cs) => ({
        ...cs,
        indicators: sortByOrderThenCode(cs.indicators).map((ind) => ({
          ...ind,
          exemplars: [...ind.exemplars].sort(
            (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
          ),
        })),
      })),
    })),
  }));

  const normalized = {
    phase,
    level,
    subject,
    name,
    slug,
    orderIndex,
    description,
    strands: normalizedStrands,
  };

  // Print to stdout so you can copy-paste
  console.log(JSON.stringify(normalized, null, 2));
}

// Run
normalize();
