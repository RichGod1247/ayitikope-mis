// prisma/seed/normalize-kg2-owop.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Polyfill __dirname for ESM / ts-node
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Final normalized types (what we want to end up with)
 */
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

type CurriculumJson = {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description: string;
  strands: StrandJson[];
};

/**
 * Raw types from Gemini.
 * Everything is tucked into subject.imagePrompts[].
 */
type RawNode = {
  nodeType: string; // "strand" | "subStrand" | "contentStandard" | "indicator" | "exemplar"
  strandCode: string;
  subStrandCode?: string | null;
  contentStandardCode?: string | null;
  indicatorCode?: string | null;
  exemplarIndex?: number | null;
  ageBand?: string;
  prompt?: string; // we'll use this as description
  orderIndex?: number;
  [key: string]: any;
};

type RawSubject = {
  phase: string;
  level: string;
  name: string;
  slug: string;
  orderIndex: number;
  description: string;
  imagePrompts?: RawNode[];
  [key: string]: any;
};

type RawFile = {
  part?: string;
  subjects: RawSubject[];
};

/**
 * Helpers
 */
function ensureArray<T>(val: T[] | undefined | null): T[] {
  return Array.isArray(val) ? val : [];
}

/**
 * Global maps so we can merge across all 4 parts
 */
const strandMap = new Map<string, StrandJson>();

function getOrCreateStrand(code: string): StrandJson {
  let strand = strandMap.get(code);
  if (!strand) {
    strand = {
      code,
      title: code, // fallback title = code (since Gemini didn't give human titles here)
      description: "",
      orderIndex: 0,
      subStrands: [],
    };
    strandMap.set(code, strand);
  }
  return strand;
}

function getOrCreateSubStrand(
  strandCode: string,
  subStrandCode: string,
): SubStrandJson {
  const strand = getOrCreateStrand(strandCode);
  strand.subStrands = ensureArray(strand.subStrands);

  let sub = strand.subStrands.find((s) => s.code === subStrandCode);
  if (!sub) {
    sub = {
      code: subStrandCode,
      title: subStrandCode,
      description: "",
      orderIndex: 0,
      contentStandards: [],
    };
    strand.subStrands.push(sub);
  }
  return sub;
}

function getOrCreateContentStandard(
  strandCode: string,
  subStrandCode: string,
  csCode: string,
): ContentStandardJson {
  const sub = getOrCreateSubStrand(strandCode, subStrandCode);
  sub.contentStandards = ensureArray(sub.contentStandards);

  let cs = sub.contentStandards.find((c) => c.code === csCode);
  if (!cs) {
    cs = {
      code: csCode,
      description: "",
      orderIndex: 0,
      indicators: [],
    };
    sub.contentStandards.push(cs);
  }
  return cs;
}

function getOrCreateIndicator(
  strandCode: string,
  subStrandCode: string,
  csCode: string,
  indicatorCode: string,
): IndicatorJson {
  const cs = getOrCreateContentStandard(strandCode, subStrandCode, csCode);
  cs.indicators = ensureArray(cs.indicators);

  let ind = cs.indicators.find((i) => i.code === indicatorCode);
  if (!ind) {
    ind = {
      code: indicatorCode,
      description: "",
      orderIndex: 0,
      exemplars: [],
    };
    cs.indicators.push(ind);
  }
  return ind;
}

function addExemplar(ind: IndicatorJson, exemplar: ExemplarJson) {
  // Avoid duplicates (same orderIndex + description)
  const exists = ind.exemplars.some(
    (e) =>
      e.orderIndex === exemplar.orderIndex &&
      e.description.trim() === exemplar.description.trim(),
  );
  if (!exists) {
    ind.exemplars.push(exemplar);
  }
}

/**
 * MAIN
 */
async function main() {
  const partPaths = [
    path.join(__dirname, "..", "..", "data", "kg2-owop-part1.raw.json"),
    path.join(__dirname, "..", "..", "data", "kg2-owop-part2.raw.json"),
    path.join(__dirname, "..", "..", "data", "kg2-owop-part3.raw.json"),
    path.join(__dirname, "..", "..", "data", "kg2-owop-part4.raw.json"),
  ];

  console.log("🔎 Reading raw KG2 OWOP parts (imagePrompts-based):");
  partPaths.forEach((p) => console.log("   -", p));

  let subjectMeta:
    | {
        phase: string;
        level: string;
        name: string;
        slug: string;
        orderIndex: number;
        description: string;
      }
    | undefined;

  for (const p of partPaths) {
    const rawText = fs.readFileSync(p, "utf8");
    const raw: RawFile = JSON.parse(rawText);

    const subjects = raw.subjects || [];
    let totalNodesForFile = 0;

    // Collect nodes from all subjects in this file
    const allNodes: RawNode[] = [];
    for (const subj of subjects) {
      // Capture subject meta once (same subject repeated in all parts)
      if (!subjectMeta && subj.slug === "kg2-our-world-and-our-people") {
        subjectMeta = {
          phase: subj.phase,
          level: subj.level,
          name: "KG2 Our World and Our People",
          slug: subj.slug,
          orderIndex: subj.orderIndex,
          description: subj.description,
        };
        console.log(
          `   ✔ Captured subject meta from ${path.basename(p)}: ${subj.name}`,
        );
      }

      const nodes = ensureArray(subj.imagePrompts);
      totalNodesForFile += nodes.length;
      allNodes.push(...nodes);
    }

    console.log(
      `\n📦 Processing file ${path.basename(p)} (part: ${
        raw.part ?? "n/a"
      }) with ${subjects.length} subject(s), ${totalNodesForFile} node(s)`,
    );

    if (allNodes.length === 0) {
      console.warn(
        `   ⚠ No imagePrompts[] found or it is empty in ${path.basename(p)}.`,
      );
      continue;
    } else {
      console.log(`   → Found ${allNodes.length} node(s) from imagePrompts`);
    }

    // Walk through each node and build the hierarchy
    allNodes.forEach((node, index) => {
      const nodeType = node.nodeType;
      const strandCode = node.strandCode;
      const subStrandCode = node.subStrandCode ?? undefined;
      const contentStandardCode = node.contentStandardCode ?? undefined;
      const indicatorCode = node.indicatorCode ?? undefined;
      const prompt = (node.prompt ?? "").trim();
      const order = node.orderIndex ?? index + 1;

      if (!strandCode) {
        console.warn("   ⚠ Node without strandCode, skipping:", node);
        return;
      }

      switch (nodeType) {
        case "strand": {
          const st = getOrCreateStrand(strandCode);
          if (prompt) {
            // Use prompt as description for now
            st.description = st.description || prompt;
          }
          if (!st.orderIndex) {
            st.orderIndex = order;
          }
          break;
        }

        case "subStrand": {
          if (!subStrandCode) {
            console.warn(
              `   ⚠ subStrand node missing subStrandCode (strand ${strandCode})`,
            );
            break;
          }
          const ss = getOrCreateSubStrand(strandCode, subStrandCode);
          if (prompt) {
            ss.description = ss.description || prompt;
          }
          if (!ss.orderIndex) {
            ss.orderIndex = order;
          }
          break;
        }

        case "contentStandard": {
          if (!subStrandCode || !contentStandardCode) {
            console.warn(
              `   ⚠ contentStandard node missing subStrandCode/contentStandardCode (strand ${strandCode})`,
            );
            break;
          }
          const cs = getOrCreateContentStandard(
            strandCode,
            subStrandCode,
            contentStandardCode,
          );
          if (prompt) {
            cs.description = cs.description || prompt;
          }
          if (!cs.orderIndex) {
            cs.orderIndex = order;
          }
          break;
        }

        case "indicator": {
          if (!subStrandCode || !contentStandardCode || !indicatorCode) {
            console.warn(
              `   ⚠ indicator node missing some code(s) (strand ${strandCode})`,
            );
            break;
          }
          const ind = getOrCreateIndicator(
            strandCode,
            subStrandCode,
            contentStandardCode,
            indicatorCode,
          );
          if (prompt) {
            ind.description = ind.description || prompt;
          }
          if (!ind.orderIndex) {
            ind.orderIndex = order;
          }
          break;
        }

        case "exemplar": {
          if (!subStrandCode || !contentStandardCode || !indicatorCode) {
            console.warn(
              `   ⚠ exemplar node missing some code(s) (strand ${strandCode})`,
            );
            break;
          }
          const ind = getOrCreateIndicator(
            strandCode,
            subStrandCode,
            contentStandardCode,
            indicatorCode,
          );
          const exOrder =
            typeof node.exemplarIndex === "number"
              ? node.exemplarIndex
              : order;
          const ex: ExemplarJson = {
            orderIndex: exOrder,
            description: prompt,
          };
          addExemplar(ind, ex);
          break;
        }

        default: {
          // Ignore unknown node types
          break;
        }
      }
    });
  }

  if (!subjectMeta) {
    throw new Error(
      "Could not capture subject meta for slug 'kg2-our-world-and-our-people'. Check raw files.",
    );
  }

  // Turn strandMap into a sorted array and sort all nested children
  let strands = Array.from(strandMap.values());

  strands.forEach((st) => {
    st.subStrands = ensureArray(st.subStrands).sort(
      (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
    );
    st.subStrands.forEach((ss) => {
      ss.contentStandards = ensureArray(ss.contentStandards).sort(
        (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
      );
      ss.contentStandards.forEach((cs) => {
        cs.indicators = ensureArray(cs.indicators).sort(
          (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
        );
        cs.indicators.forEach((ind) => {
          ind.exemplars = ensureArray(ind.exemplars).sort(
            (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
          );
        });
      });
    });
  });

  strands = strands.sort(
    (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
  );

  console.log("\n📊 Summary:");
  console.log("   Total strands:", strands.length);

  const normalized: CurriculumJson = {
    phase: subjectMeta.phase,
    level: subjectMeta.level,
    subject: "Our World and Our People",
    name: subjectMeta.name,
    slug: subjectMeta.slug,
    orderIndex: subjectMeta.orderIndex,
    description: subjectMeta.description,
    strands,
  };

  const outPath = path.join(
    __dirname,
    "curriculum",
    "kg2-our-world-and-our-people.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2), "utf8");

  console.log("\n✅ Wrote normalized KG2 OWOP curriculum to:");
  console.log("   ", outPath);
  console.log("   Strands count:", normalized.strands.length);
}

main().catch((err) => {
  console.error("❌ Error normalizing KG2 OWOP", err);
  process.exit(1);
});
