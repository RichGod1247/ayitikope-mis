// prisma/seed/kg2_owop_media_canonicalizer.ts
import { promises as fs } from "fs";
import path from "path";

type RawMediaRow = {
  subjectSlug?: string | null;
  phase?: string | null;
  level?: string | null;

  strandCode?: string | null;
  subStrandCode?: string | null;
  contentStandardCode?: string | null;
  indicatorCode?: string | null;

  pageNumberInPdf?: number | null;
  sourcePage?: number | null;

  figureLabel?: string | null;
  imagePath?: string | null;
  altText?: string | null;
  detailedDescription?: string | null;
  tags?: string[] | null;
};

type CleanMediaRow = {
  subjectSlug: string;
  phase: "KG";
  level: "KG2";

  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;

  pageNumberInPdf: number;
  figureLabel?: string;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags?: string[];
};

type MappingInfo = {
  code: string;
  mappingType: "exact" | "best_fit";
  note: string;
};

type ReportRow = {
  status: "kept" | "dropped";
  basename: string;
  oldIndicatorCode?: string;
  newIndicatorCode?: string;
  mappingType?: "exact" | "best_fit";
  note: string;
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

function stripLeadingSlash(p: string): string {
  return p.replace(/^\/+/, "");
}

function splitIndicatorCode(indicatorCode: string) {
  const parts = indicatorCode.split(".");
  if (parts.length !== 5) {
    throw new Error(`Invalid indicator code: ${indicatorCode}`);
  }

  return {
    strandCode: `${parts[0]}.${parts[1]}`,
    subStrandCode: `${parts[0]}.${parts[1]}.${parts[2]}`,
    contentStandardCode: `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]}`,
    indicatorCode,
  };
}

function toIntOrZero(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

const NOISE_TAGS = new Set([
  "",
  "kg1",
  "kg2",
  "k1",
  "k2",
  "owop",
  "our-world-and-our-people",
  "our world and our people",
]);

function isNoiseTag(tag: string): boolean {
  const t = cleanText(tag).toLowerCase();

  if (!t) return true;
  if (NOISE_TAGS.has(t)) return true;
  if (/^\d+$/.test(t)) return true;
  if (/^k[12](\.\d+)+$/.test(t)) return true;
  if (/^[a-z]\d+$/.test(t)) return true;

  return false;
}

function normalizeTag(tag: unknown): string {
  const v = cleanText(tag)
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!v) return "";
  if (isNoiseTag(v)) return "";

  return v;
}

function buildTags(row: RawMediaRow): string[] | undefined {
  const sourceTags = Array.isArray(row.tags) ? row.tags : [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of sourceTags) {
    const tag = normalizeTag(raw);
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(tag);

    if (out.length >= 12) break;
  }

  return out.length ? out : undefined;
}

function compareIndicatorCodes(a: string, b: string): number {
  const aa = a.split(".").map(Number);
  const bb = b.split(".").map(Number);
  const len = Math.max(aa.length, bb.length);

  for (let i = 0; i < len; i++) {
    const av = aa[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (av !== bv) return av - bv;
  }

  return 0;
}

/**
 * Explicit, reviewed KG1 -> KG2 OWOP reuse map.
 * We keep only high-confidence or consciously accepted best-fit thematic reuse.
 */
const KEEP_MAP: Record<string, MappingInfo> = {
  "K1.1.1.1.1-body-features.png": {
    code: "K2.1.1.1.1",
    mappingType: "exact",
    note: "Body identity/self-description reuse is exact.",
  },
  "K1.1.1.1.2-personal-hygiene.png": {
    code: "K2.1.3.1.1",
    mappingType: "exact",
    note: "Personal hygiene image belongs under hygiene/body-care.",
  },
  "K1.1.1.1.3-book-parts-and-body-parts.png": {
    code: "K2.1.2.1.2",
    mappingType: "best_fit",
    note: "Read-aloud/body-functions bridge; best-fit under body-parts-and-functions text work.",
  },
  "K1.1.1.1.4-body-parts-in-action.png": {
    code: "K2.1.1.1.7",
    mappingType: "best_fit",
    note: "Movement/body-parts reuse accepted as support media for body-parts/counting integration.",
  },
  "K1.1.1.1.5-personal-hygiene-routines.png": {
    code: "K2.1.3.1.1",
    mappingType: "exact",
    note: "Daily hygiene routines are exact support media for hygiene.",
  },

  "K1.1.2.1.1-family-types-and-members.png": {
    code: "K2.2.1.1.1",
    mappingType: "exact",
    note: "Family types/members reuse is exact.",
  },
  "K1.1.2.1.2-matching-family-duties.png": {
    code: "K2.2.1.1.1",
    mappingType: "exact",
    note: "Family duties strongly support roles/responsibilities.",
  },
  "K1.1.2.1.3-family-story-roles.png": {
    code: "K2.2.1.1.2",
    mappingType: "exact",
    note: "Family story read-aloud reuse is exact enough for family text work.",
  },
  "K1.1.2.1.4-family-texts.png": {
    code: "K2.2.1.1.2",
    mappingType: "exact",
    note: "Family texts are exact support media for family reading activity.",
  },
  "K1.1.2.1.5-family-love-and-respect.png": {
    code: "K2.3.1.1.1",
    mappingType: "best_fit",
    note: "Family love/respect is best-fit under personal values.",
  },

  "K1.1.3.1.1-home-parts.png": {
    code: "K2.2.1.1.1",
    mappingType: "best_fit",
    note: "Home-part scene reused under family-life context.",
  },
  "K1.1.3.1.2-home-activities.png": {
    code: "K2.2.1.1.1",
    mappingType: "best_fit",
    note: "Home roles/routines reused under family-life context.",
  },
  "K1.1.3.1.3-home-books-and-stories.png": {
    code: "K2.2.1.1.2",
    mappingType: "best_fit",
    note: "Home story reuse placed under family text activity.",
  },
  "K1.1.3.1.4-home-safety-rules.png": {
    code: "K2.1.5.1.1",
    mappingType: "exact",
    note: "Home/environment safety fits environment and health.",
  },

  "K1.1.4.1.1-school-physical-features.png": {
    code: "K2.2.4.1.1",
    mappingType: "exact",
    note: "School features fit school family and school life.",
  },
  "K1.1.4.1.2-school-community-members.png": {
    code: "K2.2.4.1.1",
    mappingType: "exact",
    note: "School community members fit school family.",
  },
  "K1.1.4.1.3-school-activities.png": {
    code: "K2.2.4.1.1",
    mappingType: "best_fit",
    note: "School activities support school family/life context.",
  },
  "K1.1.4.1.4-school-texts.png": {
    code: "K2.2.4.1.2",
    mappingType: "best_fit",
    note: "School text reuse aligned to school-family literacy activity.",
  },
  "K1.1.4.1.5-school-safety.png": {
    code: "K2.2.4.1.1",
    mappingType: "best_fit",
    note: "School safety kept under school family context.",
  },

  "K1.2.1.1.1-living-and-nonliving-environment.png": {
    code: "K2.6.1.1.1",
    mappingType: "exact",
    note: "Living/non-living environment reuse is exact.",
  },
  "K1.2.1.1.2-living-vs-nonliving-characteristics.png": {
    code: "K2.6.1.1.1",
    mappingType: "exact",
    note: "Characteristics chart directly supports classification discussion.",
  },
  "K1.2.1.1.3-living-nonliving-storytime.png": {
    code: "K2.6.1.1.2",
    mappingType: "exact",
    note: "Story/read-aloud reuse is exact enough.",
  },

  "K1.2.2.1.1-plant-parts-observation.png": {
    code: "K2.6.5.1.1",
    mappingType: "exact",
    note: "Plant parts observation reuse is exact.",
  },
  "K1.2.2.1.2-uses-of-plants.png": {
    code: "K2.6.5.1.1",
    mappingType: "best_fit",
    note: "Plant uses accepted under plant-parts-and-uses content standard.",
  },
  "K1.2.2.1.3-plants-texts.png": {
    code: "K2.6.6.1.3",
    mappingType: "exact",
    note: "Plant-growth text reuse fits Plants-2 story/read-aloud work.",
  },
  "K1.2.2.1.4-care-for-plants.png": {
    code: "K2.6.6.1.1",
    mappingType: "exact",
    note: "Plant care image fits plant needs/growth discussion.",
  },

  "K1.2.3.1.1-domestic-and-wild-animals.png": {
    code: "K2.6.2.1.1",
    mappingType: "exact",
    note: "Domestic/wild animal chart reuse is exact.",
  },
  "K1.2.3.1.2-animal-sounds-and-movements.png": {
    code: "K2.6.2.1.4",
    mappingType: "best_fit",
    note: "Animal sounds/movements accepted under animal name/syllable activity.",
  },
  "K1.2.3.1.3-animal-texts.png": {
    code: "K2.6.2.1.2",
    mappingType: "exact",
    note: "Animal text reuse is exact enough.",
  },
  "K1.2.3.1.4-animal-kindness.png": {
    code: "K2.6.2.1.1",
    mappingType: "best_fit",
    note: "Animal-care image retained as support media for animal importance/care discussion.",
  },

  "K1.2.4.1.1-water-sources.png": {
    code: "K2.6.3.1.1",
    mappingType: "exact",
    note: "Water sources reuse is exact.",
  },
  "K1.2.4.1.2-water-uses.png": {
    code: "K2.6.3.1.1",
    mappingType: "exact",
    note: "Water uses directly support water importance discussion.",
  },
  "K1.2.4.1.3-water-texts.png": {
    code: "K2.6.3.1.2",
    mappingType: "exact",
    note: "Water text reuse is exact enough.",
  },
  "K1.2.4.1.4-water-use-and-storage.png": {
    code: "K2.6.3.1.1",
    mappingType: "best_fit",
    note: "Water care/storage retained under water importance/use discussion.",
  },

  "K1.2.5.1.1-air-presence.png": {
    code: "K2.6.4.1.1",
    mappingType: "exact",
    note: "Air presence reuse is exact.",
  },
  "K1.2.5.1.2-air-uses.png": {
    code: "K2.6.4.1.1",
    mappingType: "exact",
    note: "Air uses directly support air importance.",
  },
  "K1.2.5.1.3-air-texts.png": {
    code: "K2.6.4.1.3",
    mappingType: "exact",
    note: "Air text reuse is exact enough.",
  },
  "K1.2.5.1.4-clean-air-practices.png": {
    code: "K2.6.4.1.1",
    mappingType: "best_fit",
    note: "Clean-air stewardship kept under air importance discussion.",
  },

  "K1.3.1.1.1-creation-gifts.png": {
    code: "K2.3.4.1.1",
    mappingType: "exact",
    note: "Creation/belief media aligns with beliefs strand.",
  },
  "K1.3.1.1.2-god-provides.png": {
    code: "K2.3.4.1.1",
    mappingType: "best_fit",
    note: "Provision scene kept under beliefs discussion.",
  },
  "K1.3.1.1.3-creation-texts.png": {
    code: "K2.3.4.1.2",
    mappingType: "exact",
    note: "Creation text reuse is exact enough.",
  },
  "K1.3.1.1.4-appreciation-to-god.png": {
    code: "K2.3.4.1.1",
    mappingType: "best_fit",
    note: "Appreciation/worship scene retained under beliefs discussion.",
  },

  "K1.3.2.1.1-good-values.png": {
    code: "K2.3.2.1.1",
    mappingType: "exact",
    note: "Good values reuse is exact.",
  },
  "K1.3.2.1.2-practising-values.png": {
    code: "K2.3.2.1.1",
    mappingType: "exact",
    note: "Practising values supports cultural virtues/behaviour.",
  },
  "K1.3.2.1.3-values-texts.png": {
    code: "K2.3.2.1.2",
    mappingType: "exact",
    note: "Values text reuse is exact enough.",
  },
};

async function main() {
  const inputArg =
    process.argv[2] ?? "prisma/seed/curriculum/kg2-owop-media.json";

  const outputArg =
    process.argv[3] ??
    "prisma/seed/curriculum/kg2-our-world-and-our-people-media.clean.json";

  const inputPath = path.resolve(process.cwd(), inputArg);
  const outputPath = path.resolve(process.cwd(), outputArg);
  const reportPath = outputPath.replace(/\.json$/i, ".report.json");

  const raw = await fs.readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw) as RawMediaRow[];

  if (!Array.isArray(parsed)) {
    throw new Error("Expected top-level JSON array in KG2 OWOP media file.");
  }

  const output: CleanMediaRow[] = [];
  const report: ReportRow[] = [];

  for (const row of parsed) {
    const rawImagePath = cleanText(row.imagePath);
    const basename = path.basename(rawImagePath);
    const mapping = KEEP_MAP[basename];

    if (!mapping) {
      report.push({
        status: "dropped",
        basename,
        oldIndicatorCode: cleanText(row.indicatorCode),
        note: "No explicit reviewed mapping into clean KG2 OWOP hierarchy.",
      });
      continue;
    }

    const codes = splitIndicatorCode(mapping.code);
    const normalizedImagePath = stripLeadingSlash(rawImagePath);

    const altText = cleanText(row.altText);
    const detailedDescription = cleanText(row.detailedDescription);

    if (!altText || !detailedDescription) {
      report.push({
        status: "dropped",
        basename,
        oldIndicatorCode: cleanText(row.indicatorCode),
        newIndicatorCode: mapping.code,
        mappingType: mapping.mappingType,
        note: "Dropped because altText or detailedDescription is empty after cleanup.",
      });
      continue;
    }

    const cleanRow: CleanMediaRow = {
      subjectSlug: "kg2-our-world-and-our-people",
      phase: "KG",
      level: "KG2",

      strandCode: codes.strandCode,
      subStrandCode: codes.subStrandCode,
      contentStandardCode: codes.contentStandardCode,
      indicatorCode: codes.indicatorCode,

      pageNumberInPdf:
        toIntOrZero(row.pageNumberInPdf) || toIntOrZero(row.sourcePage),

      figureLabel: cleanText(row.figureLabel) || undefined,
      imagePath: normalizedImagePath,
      altText,
      detailedDescription,
      tags: buildTags(row),
    };

    output.push(cleanRow);

    report.push({
      status: "kept",
      basename,
      oldIndicatorCode: cleanText(row.indicatorCode),
      newIndicatorCode: mapping.code,
      mappingType: mapping.mappingType,
      note: mapping.note,
    });
  }

  output.sort((a, b) => {
    const byCode = compareIndicatorCodes(a.indicatorCode, b.indicatorCode);
    if (byCode !== 0) return byCode;
    return a.imagePath.localeCompare(b.imagePath);
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        inputPath,
        outputPath,
        totalInput: parsed.length,
        totalOutput: output.length,
        kept: report.filter((r) => r.status === "kept").length,
        dropped: report.filter((r) => r.status === "dropped").length,
        exactMappings: report.filter(
          (r) => r.status === "kept" && r.mappingType === "exact"
        ).length,
        bestFitMappings: report.filter(
          (r) => r.status === "kept" && r.mappingType === "best_fit"
        ).length,
        report,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(`✅ Wrote clean KG2 OWOP media JSON to: ${outputPath}`);
  console.log(`🧾 Wrote media cleanup report to: ${reportPath}`);
  console.log(`→ Input rows: ${parsed.length}`);
  console.log(`→ Output rows: ${output.length}`);
  console.log(`→ Exact mappings: ${report.filter((r) => r.status === "kept" && r.mappingType === "exact").length}`);
  console.log(`→ Best-fit mappings: ${report.filter((r) => r.status === "kept" && r.mappingType === "best_fit").length}`);
  console.log(`→ Dropped rows: ${report.filter((r) => r.status === "dropped").length}`);
}

main().catch((err) => {
  console.error("❌ Failed to canonicalize KG2 OWOP media JSON:", err);
  process.exit(1);
});