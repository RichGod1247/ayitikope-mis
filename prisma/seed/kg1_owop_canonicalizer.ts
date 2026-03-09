//prisma/seed/kg1_owop_canonicalizer.ts
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
  level: "KG1";
  subject: "Our World and Our People";
  name: "KG1 Our World and Our People";
  slug: "kg1-our-world-and-our-people";
  orderIndex: 1;
  description: string;
  strands: StrandOut[];
};

type Warning = { kind: string; path: string; from?: string | null; to?: string | null; note?: string };

const OFFICIAL_STRANDS: Array<{ code: string; title: string; description: string }> = [
  {
    code: "K1.1",
    title: "ALL ABOUT ME",
    description: "Learners explore their unique identity, body parts, personal hygiene, healthy living, environmental health, and personal safety.",
  },
  {
    code: "K1.2",
    title: "MY FAMILY",
    description: "Learners explore family types, family history, celebrations, and rules that guide school family life.",
  },
  {
    code: "K1.3",
    title: "VALUES AND BELIEFS",
    description: "Learners develop family, cultural, religious, and moral values, and learn to relate well with people of different beliefs.",
  },
  {
    code: "K1.4",
    title: "MY LOCAL COMMUNITY",
    description: "Learners identify special places, occupations, and leaders in their local community and understand their roles.",
  },
  {
    code: "K1.5",
    title: "MY NATION GHANA",
    description: "Learners explore Ghana’s independence, national identity, symbols, and celebrations.",
  },
  {
    code: "K1.6",
    title: "ALL AROUND US",
    description: "Learners explore living and non-living things, animals, water, air, plants, gardening, light, and changing weather conditions.",
  },
  {
    code: "K1.7",
    title: "MY GLOBAL COMMUNITY",
    description: "Learners explore transportation, communication, and trade as ways of connecting with the wider world.",
  },
];

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseLoose(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function ensureNonEmpty(value: unknown, fallback: string): string {
  const v = cleanText(value);
  return v || fallback;
}

function normalizeSentence(value: string): string {
  const v = cleanText(value);
  return v || "Description missing.";
}

function seqCode(parentCode: string, index1: number): string {
  return `${parentCode}.${index1}`;
}

function warn(
  warnings: Warning[],
  kind: string,
  path: string,
  from?: string | null,
  to?: string | null,
  note?: string
) {
  warnings.push({ kind, path, from: from ?? null, to: to ?? null, note });
}

function findOfficialStrand(code: string) {
  return OFFICIAL_STRANDS.find((s) => s.code === code) ?? null;
}

function normalizeExemplars(exemplars: ExemplarIn[] | null | undefined): ExemplarOut[] {
  const rows = Array.isArray(exemplars) ? exemplars : [];
  return rows
    .map((ex, idx) => ({
      orderIndex: idx + 1,
      description: normalizeSentence(cleanText(ex.description)),
    }))
    .filter((ex) => ex.description !== "Description missing.");
}

function normalizeSubject(input: SubjectIn): { output: SubjectOut; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const inputStrands = Array.isArray(input.strands) ? input.strands : [];

  const output: SubjectOut = {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People",
    name: "KG1 Our World and Our People",
    slug: "kg1-our-world-and-our-people",
    orderIndex: 1,
    description:
      cleanText(input.description) ||
      "The KG1 Our World and Our People curriculum integrates Language and Literacy, Numeracy, Creative Arts, and Our World and Our People into thematic units to support holistic early childhood learning in the Ghana NaCCA curriculum.",
    strands: [],
  };

  for (let sIdx = 0; sIdx < inputStrands.length; sIdx++) {
    const strandIn = inputStrands[sIdx] ?? {};
    const strandCode = `K1.${sIdx + 1}`;
    const official = findOfficialStrand(strandCode);
    const strandPath = strandCode;

    if (cleanText(strandIn.code) && cleanText(strandIn.code) !== strandCode) {
      warn(warnings, "strand_code_normalized", strandPath, cleanText(strandIn.code), strandCode);
    }

    const strandOut: StrandOut = {
      code: strandCode,
      title: official?.title ?? ensureNonEmpty(strandIn.title, strandCode),
      description:
        official?.description ?? normalizeSentence(cleanText(strandIn.description) || `${official?.title ?? strandCode} strand.`),
      orderIndex: sIdx + 1,
      subStrands: [],
    };

    const subStrandsIn = Array.isArray(strandIn.subStrands) ? strandIn.subStrands : [];

    for (let ssIdx = 0; ssIdx < subStrandsIn.length; ssIdx++) {
      const subIn = subStrandsIn[ssIdx] ?? {};
      const subCode = `${strandCode}.${ssIdx + 1}`;
      const subPath = subCode;

      if (cleanText(subIn.code) && cleanText(subIn.code) !== subCode) {
        warn(warnings, "substrand_code_normalized", subPath, cleanText(subIn.code), subCode);
      }

      const subOut: SubStrandOut = {
        code: subCode,
        title: ensureNonEmpty(cleanText(subIn.title), titleCaseLoose(subCode)),
        description: normalizeSentence(cleanText(subIn.description)),
        orderIndex: ssIdx + 1,
        contentStandards: [],
      };

      const csIn = Array.isArray(subIn.contentStandards) ? subIn.contentStandards : [];

      for (let csIdx = 0; csIdx < csIn.length; csIdx++) {
        const csItem = csIn[csIdx] ?? {};
        const csCode = `${subCode}.${csIdx + 1}`;
        const csPath = csCode;

        if (cleanText(csItem.code) && cleanText(csItem.code) !== csCode) {
          warn(warnings, "content_standard_code_normalized", csPath, cleanText(csItem.code), csCode);
        }

        const csOut: ContentStandardOut = {
          code: csCode,
          description: normalizeSentence(cleanText(csItem.description)),
          orderIndex: csIdx + 1,
          indicators: [],
        };

        const indicatorsIn = Array.isArray(csItem.indicators) ? csItem.indicators : [];

        for (let iIdx = 0; iIdx < indicatorsIn.length; iIdx++) {
          const indIn = indicatorsIn[iIdx] ?? {};
          const indCode = `${csCode}.${iIdx + 1}`;
          const indPath = indCode;

          if (cleanText(indIn.code) && cleanText(indIn.code) !== indCode) {
            warn(warnings, "indicator_code_normalized", indPath, cleanText(indIn.code), indCode);
          }

          const exemplarsOut = normalizeExemplars(indIn.exemplars);
          if (!exemplarsOut.length) {
            warn(warnings, "indicator_missing_exemplars", indPath, null, null, "Indicator has no exemplar rows after cleanup.");
          }

          const indOut: IndicatorOut = {
            code: indCode,
            description: normalizeSentence(cleanText(indIn.description)),
            orderIndex: iIdx + 1,
            exemplars: exemplarsOut,
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
      "Usage: npx ts-node prisma/seed/kg1-owop-canonicalizer.ts <input-json> [output-json]"
    );
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  const outputPath = path.resolve(
    process.cwd(),
    outputArg || "prisma/seed/curriculum/kg1-our-world-and-our-people.clean.json"
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

  console.log(`✅ Wrote clean canonical KG1 OWOP JSON to: ${outputPath}`);
  console.log(`🧾 Wrote normalization report to: ${reportPath}`);
  console.log(`⚠️ Warnings: ${warnings.length}`);
}

main().catch((err) => {
  console.error("❌ Failed to canonicalize KG1 OWOP JSON:", err);
  process.exit(1);
});
