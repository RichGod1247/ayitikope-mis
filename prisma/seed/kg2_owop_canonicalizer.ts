// prisma/seed/kg2_owop_canonicalizer.ts
import { promises as fs } from "fs";
import path from "path";

type ExemplarIn = {
  orderIndex?: number | null;
  title?: string | null;
  description?: string | null;
  assessmentNotes?: string | null;
};

type IndicatorIn = {
  code?: string | null;
  description?: string | null;
  orderIndex?: number | null;
  exemplars?: ExemplarIn[] | null;
};

type ContentStandardIn = {
  code?: string | null;
  description?: string | null;
  orderIndex?: number | null;
  indicators?: IndicatorIn[] | null;
};

type SubStrandIn = {
  code?: string | null;
  title?: string | null;
  description?: string | null;
  orderIndex?: number | null;
  contentStandards?: ContentStandardIn[] | null;
};

type StrandIn = {
  code?: string | null;
  title?: string | null;
  description?: string | null;
  orderIndex?: number | null;
  subStrands?: SubStrandIn[] | null;
};

type SubjectIn = {
  phase?: string | null;
  level?: string | null;
  subject?: string | null;
  name?: string | null;
  slug?: string | null;
  orderIndex?: number | null;
  description?: string | null;
  strands?: StrandIn[] | null;
};

type ExemplarOut = {
  orderIndex: number;
  description: string;
};

type IndicatorOut = {
  code: string;
  description: string;
  orderIndex: number;
  exemplars: ExemplarOut[];
};

type ContentStandardOut = {
  code: string;
  description: string;
  orderIndex: number;
  indicators: IndicatorOut[];
};

type SubStrandOut = {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  contentStandards: ContentStandardOut[];
};

type StrandOut = {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  subStrands: SubStrandOut[];
};

type SubjectOut = {
  phase: "KG";
  level: "KG2";
  subject: "Our World and Our People";
  name: "KG2 Our World and Our People";
  slug: "kg2-our-world-and-our-people";
  orderIndex: 1;
  description: string;
  strands: StrandOut[];
};

type Warning = {
  kind: string;
  path: string;
  from?: string | null;
  to?: string | null;
  note?: string;
};

type OfficialStrand = {
  code: string;
  title: string;
  description: string;
};

type OfficialSubStrand = {
  title: string;
  description: string;
};

const OFFICIAL_STRANDS: OfficialStrand[] = [
  {
    code: "K2.1",
    title: "ALL ABOUT ME",
    description:
      "Learners explore their identity, body parts and functions, personal hygiene, healthy living, environmental health, and personal safety.",
  },
  {
    code: "K2.2",
    title: "MY FAMILY",
    description:
      "Learners explore family types, family history, celebrations, and the rules that guide home and school family life.",
  },
  {
    code: "K2.3",
    title: "VALUES AND BELIEFS",
    description:
      "Learners develop personal, cultural, national, civic, and religious values, and learn to relate well with people of different beliefs.",
  },
  {
    code: "K2.4",
    title: "MY LOCAL COMMUNITY",
    description:
      "Learners identify special places, occupations, and leaders in their local community and understand their roles.",
  },
  {
    code: "K2.5",
    title: "MY NATION GHANA",
    description:
      "Learners explore Ghana’s history, identity, symbols, and national celebrations.",
  },
  {
    code: "K2.6",
    title: "ALL AROUND US",
    description:
      "Learners explore living and non-living things, animals, water, air, plants, soil, gardening, light, and changing weather conditions.",
  },
  {
    code: "K2.7",
    title: "MY GLOBAL COMMUNITY",
    description:
      "Learners explore transportation, communication, and global connection as ways of relating with the wider world.",
  },
];

const OFFICIAL_SUBSTRANDS: Record<string, OfficialSubStrand> = {
  "K2.1.1": {
    title: "I am a wonderful and unique creation",
    description:
      "Learners describe themselves positively and appreciate the unique features that make each person special.",
  },
  "K2.1.2": {
    title: "The parts of the human body and their functions",
    description:
      "Learners identify external and internal body parts and describe what they do.",
  },
  "K2.1.3": {
    title: "Personal hygiene and caring for the parts of the body",
    description:
      "Learners discuss and practise personal hygiene and proper care of the body.",
  },
  "K2.1.4": {
    title: "Eating good food and taking my vaccinations to keep my body healthy",
    description:
      "Learners explore healthy food, balanced diet, vaccination, and simple habits for staying healthy.",
  },
  "K2.1.5": {
    title: "My Environment and My Health",
    description:
      "Learners identify safe and unsafe features in their environment and discuss how the environment affects health.",
  },
  "K2.1.6": {
    title: "Protecting ourselves from road accidents and harmful strangers",
    description:
      "Learners explore basic personal safety, including road safety and staying safe from harmful strangers.",
  },

  "K2.2.1": {
    title: "Types and members of my Family",
    description:
      "Learners identify family members and discuss their rights, roles, and responsibilities.",
  },
  "K2.2.2": {
    title: "Origin and Family History",
    description:
      "Learners explore family origin, history, home language, and cultural background.",
  },
  "K2.2.3": {
    title: "Family Celebrations and Festivals",
    description:
      "Learners discuss family celebrations, festivals, and the activities associated with them.",
  },
  "K2.2.4": {
    title: "My School Family",
    description:
      "Learners identify members of the school family and discuss the rules that guide life in school.",
  },

  "K2.3.1": {
    title: "My Personal Values",
    description:
      "Learners discuss personal likes, dislikes, and values that influence how they live with others.",
  },
  "K2.3.2": {
    title: "My Cultural Values",
    description:
      "Learners explore culturally valued virtues, manners, greetings, and behaviour patterns.",
  },
  "K2.3.3": {
    title: "My National and Civic Values",
    description:
      "Learners identify values and behaviours expected of good Ghanaian learners and citizens.",
  },
  "K2.3.4": {
    title: "Our Beliefs",
    description:
      "Learners learn to relate well with people of different beliefs, cultures, and languages.",
  },

  "K2.4.1": {
    title: "Knowing the Special Places in My Community",
    description:
      "Learners identify special places in the local community and discuss what happens there.",
  },
  "K2.4.2": {
    title: "Knowing the Important People / Occupation in My Community",
    description:
      "Learners identify important people and occupations in the community and discuss their work.",
  },
  "K2.4.3": {
    title: "Knowing the Special Leaders in Our Community and Country",
    description:
      "Learners identify community and national leaders and discuss their roles.",
  },

  "K2.5.1": {
    title: "History and Celebrations of Ghana",
    description:
      "Learners explore Ghana’s history, independence, and national celebrations.",
  },

  "K2.6.1": {
    title: "Living and Non-Living Things",
    description:
      "Learners distinguish between living and non-living things in their environment.",
  },
  "K2.6.2": {
    title: "Living Things - Domestic and Wild Animals",
    description:
      "Learners identify domestic and wild animals and discuss their importance.",
  },
  "K2.6.3": {
    title: "Water",
    description:
      "Learners explore sources, importance, uses, and care of water.",
  },
  "K2.6.4": {
    title: "Air",
    description:
      "Learners explore air as an important natural resource all around us.",
  },
  "K2.6.5": {
    title: "Plants - 1",
    description:
      "Learners identify parts of plants and discuss their uses.",
  },
  "K2.6.6": {
    title: "Plants - 2",
    description:
      "Learners explore what plants need to grow and how plants grow.",
  },
  "K2.6.7": {
    title: "Types of Soil and Gardening",
    description:
      "Learners identify types of soil and explore gardening activities.",
  },
  "K2.6.8": {
    title: "Natural and Man-Made (Artificial) Sources of Light",
    description:
      "Learners identify natural and artificial sources of light and discuss their usefulness.",
  },
  "K2.6.9": {
    title: "Changing Weather Conditions",
    description:
      "Learners identify changing weather conditions and discuss their effects.",
  },

  "K2.7.1": {
    title: "Connecting and Communicating with the Global Community",
    description:
      "Learners explore ways people connect and communicate with the wider world.",
  },
};

const OFFICIAL_SUBSTRAND_ORDER: Record<string, string[]> = {
  "K2.1": ["K2.1.1", "K2.1.2", "K2.1.3", "K2.1.4", "K2.1.5", "K2.1.6"],
  "K2.2": ["K2.2.1", "K2.2.2", "K2.2.3", "K2.2.4"],
  "K2.3": ["K2.3.1", "K2.3.2", "K2.3.3", "K2.3.4"],
  "K2.4": ["K2.4.1", "K2.4.2", "K2.4.3"],
  "K2.5": ["K2.5.1"],
  "K2.6": [
    "K2.6.1",
    "K2.6.2",
    "K2.6.3",
    "K2.6.4",
    "K2.6.5",
    "K2.6.6",
    "K2.6.7",
    "K2.6.8",
    "K2.6.9",
  ],
  "K2.7": ["K2.7.1"],
};

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCodeish(value: unknown): string {
  return cleanText(value)
    .replace(/(\d)\s+(\d)/g, "$1.$2")
    .replace(/\s*\.\s*/g, ".")
    .replace(/\s+/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/\.$/, "");
}

function normalizeSentence(value: unknown, fallback = "Description missing."): string {
  const v = cleanText(value);
  return v || fallback;
}

function ensureNonEmpty(value: unknown, fallback: string): string {
  const v = cleanText(value);
  return v || fallback;
}

function warn(
  warnings: Warning[],
  kind: string,
  pathStr: string,
  from?: string | null,
  to?: string | null,
  note?: string
) {
  warnings.push({
    kind,
    path: pathStr,
    from: from ?? null,
    to: to ?? null,
    note,
  });
}

function codeParts(code: string): number[] {
  return normalizeCodeish(code)
    .split(".")
    .map((part) => {
      const n = Number(part.replace(/[^\d]/g, ""));
      return Number.isFinite(n) ? n : 0;
    });
}

function compareCodes(a: string, b: string): number {
  const ap = codeParts(a);
  const bp = codeParts(b);
  const max = Math.max(ap.length, bp.length);
  for (let i = 0; i < max; i++) {
    const av = ap[i] ?? 0;
    const bv = bp[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return a.localeCompare(b);
}

function lastNumericSegment(code: string): string | null {
  const normalized = normalizeCodeish(code);
  const match = normalized.match(/(\d+)$/);
  return match ? match[1] : null;
}

function normalizeChildCode(
  rawCode: unknown,
  expectedParent: string,
  fallbackIndex: number,
  warnings: Warning[],
  pathStr: string,
  kind: string
): string {
  const from = normalizeCodeish(rawCode);
  if (from) {
    if (from.startsWith(`${expectedParent}.`)) {
      return from;
    }
    const lastSeg = lastNumericSegment(from);
    const fixed = `${expectedParent}.${lastSeg ?? String(fallbackIndex)}`;
    if (fixed !== from) {
      warn(warnings, kind, pathStr, from, fixed, "Parent path normalized.");
    }
    return fixed;
  }

  const derived = `${expectedParent}.${fallbackIndex}`;
  warn(warnings, kind, pathStr, null, derived, "Missing code; derived from parent.");
  return derived;
}

function normalizeExemplars(exemplars: ExemplarIn[] | null | undefined): ExemplarOut[] {
  const rows = Array.isArray(exemplars) ? exemplars : [];
  return rows
    .map((ex, idx) => ({
      orderIndex: idx + 1,
      description: normalizeSentence(ex.description),
    }))
    .filter((ex) => ex.description !== "Description missing.");
}

function buildCodeMap<T extends { code?: string | null }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const code = normalizeCodeish(row?.code);
    if (code && !map.has(code)) {
      map.set(code, row);
    }
  }
  return map;
}

function normalizeSubject(input: SubjectIn): { output: SubjectOut; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const inputStrands = Array.isArray(input.strands) ? input.strands : [];
  const strandMap = buildCodeMap(inputStrands);

  const output: SubjectOut = {
    phase: "KG",
    level: "KG2",
    subject: "Our World and Our People",
    name: "KG2 Our World and Our People",
    slug: "kg2-our-world-and-our-people",
    orderIndex: 1,
    description:
      cleanText(input.description) ||
      "The KG2 Our World and Our People curriculum deepens learners' understanding of themselves, their families, their community, Ghana, and the wider world through integrated thematic learning.",
    strands: [],
  };

  for (let sIdx = 0; sIdx < OFFICIAL_STRANDS.length; sIdx++) {
    const officialStrand = OFFICIAL_STRANDS[sIdx];
    const strandPath = officialStrand.code;
    const strandIn = strandMap.get(officialStrand.code);

    if (!strandIn) {
      warn(
        warnings,
        "missing_strand",
        strandPath,
        null,
        officialStrand.code,
        "Official strand not found in input; skipped."
      );
      continue;
    }

    const strandOut: StrandOut = {
      code: officialStrand.code,
      title: officialStrand.title,
      description: officialStrand.description,
      orderIndex: sIdx + 1,
      subStrands: [],
    };

    const subRows = Array.isArray(strandIn.subStrands) ? strandIn.subStrands : [];
    const subMap = buildCodeMap(subRows);
    const officialSubCodes = OFFICIAL_SUBSTRAND_ORDER[officialStrand.code] ?? [];

    for (let ssIdx = 0; ssIdx < officialSubCodes.length; ssIdx++) {
      const subCode = officialSubCodes[ssIdx];
      const subIn = subMap.get(subCode);
      const subMeta = OFFICIAL_SUBSTRANDS[subCode];

      if (!subIn) {
        warn(
          warnings,
          "missing_substrand",
          subCode,
          null,
          subCode,
          "Official sub-strand not found in input; skipped."
        );
        continue;
      }

      const subOut: SubStrandOut = {
        code: subCode,
        title: subMeta?.title ?? ensureNonEmpty(subIn.title, subCode),
        description:
          subMeta?.description ?? normalizeSentence(subIn.description, `${subCode} sub-strand.`),
        orderIndex: ssIdx + 1,
        contentStandards: [],
      };

      const csRows = Array.isArray(subIn.contentStandards) ? subIn.contentStandards : [];
      const normalizedCs = csRows.map((cs, idx) => {
        const code = normalizeChildCode(
          cs?.code,
          subCode,
          idx + 1,
          warnings,
          `${subCode}.contentStandard[${idx}]`,
          "content_standard_code_normalized"
        );
        return { raw: cs, code };
      });

      normalizedCs.sort((a, b) => compareCodes(a.code, b.code));

      for (let csIdx = 0; csIdx < normalizedCs.length; csIdx++) {
        const csCode = normalizedCs[csIdx].code;
        const csIn = normalizedCs[csIdx].raw ?? {};

        const csOut: ContentStandardOut = {
          code: csCode,
          description: normalizeSentence(csIn.description),
          orderIndex: csIdx + 1,
          indicators: [],
        };

        const indicatorRows = Array.isArray(csIn.indicators) ? csIn.indicators : [];
        const normalizedIndicators = indicatorRows.map((ind, idx) => {
          const code = normalizeChildCode(
            ind?.code,
            csCode,
            idx + 1,
            warnings,
            `${csCode}.indicator[${idx}]`,
            "indicator_code_normalized"
          );
          return { raw: ind, code };
        });

        normalizedIndicators.sort((a, b) => compareCodes(a.code, b.code));

        for (let iIdx = 0; iIdx < normalizedIndicators.length; iIdx++) {
          const indCode = normalizedIndicators[iIdx].code;
          const indIn = normalizedIndicators[iIdx].raw ?? {};
          const exemplars = normalizeExemplars(indIn.exemplars);

          if (!exemplars.length) {
            warn(
              warnings,
              "indicator_missing_exemplars",
              indCode,
              null,
              null,
              "Indicator has no exemplar rows after cleanup."
            );
          }

          const indOut: IndicatorOut = {
            code: indCode,
            description: normalizeSentence(indIn.description),
            orderIndex: iIdx + 1,
            exemplars,
          };

          csOut.indicators.push(indOut);
        }

        subOut.contentStandards.push(csOut);
      }

      strandOut.subStrands.push(subOut);
    }

    output.strands.push(strandOut);
  }

  return { output, warnings };
}

async function main() {
  const inputArg = process.argv[2];
  const outputArg = process.argv[3];

  if (!inputArg) {
    console.error(
      "Usage: npx tsx prisma/seed/kg2_owop_canonicalizer.ts <input-json> [output-json]"
    );
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  const outputPath = path.resolve(
    process.cwd(),
    outputArg || "prisma/seed/curriculum/kg2-our-world-and-our-people.clean.json"
  );
  const reportPath = outputPath.replace(/\.json$/i, ".report.json");

  const raw = await fs.readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw) as SubjectIn;

  const { output, warnings } = normalizeSubject(parsed);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        inputPath,
        outputPath,
        warningCount: warnings.length,
        warnings,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(`✅ Wrote clean canonical KG2 OWOP JSON to: ${outputPath}`);
  console.log(`🧾 Wrote normalization report to: ${reportPath}`);
  console.log(`⚠️ Warnings: ${warnings.length}`);
}

main().catch((err) => {
  console.error("❌ Failed to canonicalize KG2 OWOP JSON:", err);
  process.exit(1);
});