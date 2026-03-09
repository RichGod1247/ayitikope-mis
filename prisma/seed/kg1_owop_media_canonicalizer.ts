// prisma/seed/kg1_owop_media_canonicalizer.ts
import { promises as fs } from "fs";
import path from "path";

type RawMediaRow = {
  phase?: string;
  level?: string;
  subject?: string;
  subjectSlug?: string;

  strandCode?: string;
  subStrandCode?: string;
  contentStandardCode?: string;
  indicatorCode?: string;

  assetType?: string;
  ageBand?: string;

  imagePath?: string;

  caption?: string;
  altText?: string;
  detailedDescription?: string;

  sourceDocumentTitle?: string;
  sourceDocumentYear?: number;
  sourcePage?: number;
};

type CleanMediaRow = {
  subjectSlug: string;
  phase: string;
  level: string;

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

type ReportRow = {
  status: "kept" | "dropped";
  basename: string;
  oldIndicatorCode?: string;
  newIndicatorCode?: string;
  note: string;
};

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
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

function buildTags(row: RawMediaRow, newIndicatorCode: string, imagePath: string): string[] {
  const basename = path.basename(imagePath, path.extname(imagePath));
  const bits = [
    cleanText(row.phase).toLowerCase(),
    cleanText(row.level).toLowerCase(),
    cleanText(row.subjectSlug).toLowerCase(),
    newIndicatorCode.toLowerCase(),
    ...basename.toLowerCase().split(/[^a-z0-9]+/),
  ];

  const stop = new Set([
    "", "and", "the", "our", "with", "for", "from", "in", "of", "to", "kg1", "k1"
  ]);

  return [...new Set(bits.filter((x) => x && !stop.has(x)))].slice(0, 12);
}

/**
 * High-confidence remaps only.
 * Anything not listed here is dropped on purpose.
 * That is safer than polluting the clean KG hierarchy.
 */
const KEEP_MAP: Record<string, string> = {
  "K1.1.1.1.1-body-features.png": "K1.1.1.1.1",
  "K1.1.1.1.2-personal-hygiene.png": "K1.1.2.1.1",
  "K1.1.1.1.3-book-parts-and-body-parts.png": "K1.1.1.1.3",
  "K1.1.1.1.4-body-parts-in-action.png": "K1.1.2.1.5",
  "K1.1.1.1.5-personal-hygiene-routines.png": "K1.1.3.1.1",

  "K1.1.2.1.1-family-types-and-members.png": "K1.2.1.1.1",
  "K1.1.2.1.2-matching-family-duties.png": "K1.2.1.1.1",
  "K1.1.2.1.3-family-story-roles.png": "K1.2.1.1.3",
  "K1.1.2.1.4-family-texts.png": "K1.2.1.1.3",
  "K1.1.2.1.5-family-love-and-respect.png": "K1.3.1.1.1",

  "K1.1.4.1.2-school-community-members.png": "K1.2.4.1.1",
  "K1.1.4.1.3-school-activities.png": "K1.2.4.1.1",
  "K1.1.4.1.4-school-texts.png": "K1.2.4.1.2",

  "K1.2.1.1.1-living-and-nonliving-environment.png": "K1.6.1.1.1",
  "K1.2.1.1.2-living-and-nonliving-differences.png": "K1.6.1.1.1",
  "K1.2.1.1.3-living-and-nonliving-texts.png": "K1.6.1.1.2",

  "K1.2.2.1.1-plant-parts.png": "K1.6.5.1.1",
  "K1.2.2.1.2-plant-uses.png": "K1.6.6.1.4",
  "K1.2.2.1.3-plant-texts.png": "K1.6.5.1.2",
  "K1.2.2.1.4-plant-care.png": "K1.6.6.1.1",

  "K1.2.3.1.1-animal-types.png": "K1.6.2.1.1",
  "K1.2.3.1.3-animal-texts.png": "K1.6.2.1.2",

  "K1.2.4.1.1-water-sources.png": "K1.6.3.1.1",
  "K1.2.4.1.2-water-uses.png": "K1.6.3.1.1",
  "K1.2.4.1.3-water-texts.png": "K1.6.3.1.2",

  "K1.2.5.1.1-air-presence.png": "K1.6.4.1.1",
  "K1.2.5.1.2-air-uses.png": "K1.6.4.1.4",
  "K1.2.5.1.3-air-texts.png": "K1.6.4.1.2",

  "K1.3.1.1.1-creation-gifts.png": "K1.3.4.1.1",
  "K1.3.1.1.2-god-provides.png": "K1.3.4.1.1",
  "K1.3.1.1.3-creation-texts.png": "K1.3.4.1.3",
  "K1.3.1.1.4-appreciation-to-god.png": "K1.3.4.1.5",

  "K1.3.2.1.1-good-values.png": "K1.3.2.1.1",
  "K1.3.2.1.2-practising-values.png": "K1.3.2.1.1",
  "K1.3.2.1.3-values-texts.png": "K1.3.2.1.3",

  "K1.4.1.1.1-special-places-walk.png": "K1.4.1.1.1",
  "K1.4.1.1.2-special-places-texts.png": "K1.4.1.1.2",
  "K1.4.1.1.3-national-celebrations-texts.png": "K1.5.1.1.3",

  "K1.4.2.1.1-neighbours-jobs.png": "K1.4.2.1.1",
  "K1.4.2.1.3-resource-people.png": "K1.4.2.1.3",

  "K1.4.3.1.1-community-leaders.png": "K1.4.3.1.1",
  "K1.4.3.1.2-leaders-readaloud.png": "K1.4.3.1.2",
  "K1.4.3.1.3-traditional-songs.png": "K1.4.3.1.3",

  "K1.5.1.1.2-means-of-transportation.png": "K1.7.1.1.1",
};

async function main() {
  const inputPath = path.resolve(
    process.cwd(),
    "prisma/seed/curriculum/kg1-owop-media.legacy.json"
  );

  const outputPath = path.resolve(
    process.cwd(),
    "prisma/seed/curriculum/kg1-our-world-and-our-people-media.clean.json"
  );

  const reportPath = outputPath.replace(/\.json$/i, ".report.json");

  const raw = await fs.readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw) as RawMediaRow[];

  const output: CleanMediaRow[] = [];
  const report: ReportRow[] = [];

  for (const row of parsed) {
    const rawImagePath = cleanText(row.imagePath);
    const basename = path.basename(rawImagePath);
    const mappedIndicatorCode = KEEP_MAP[basename];

    if (!mappedIndicatorCode) {
      report.push({
        status: "dropped",
        basename,
        oldIndicatorCode: cleanText(row.indicatorCode),
        note: "No safe mapping into clean KG hierarchy.",
      });
      continue;
    }

    const codes = splitIndicatorCode(mappedIndicatorCode);
    const normalizedImagePath = stripLeadingSlash(rawImagePath);

    const cleanRow: CleanMediaRow = {
      subjectSlug: "kg1-our-world-and-our-people",
      phase: "KG",
      level: "KG1",

      strandCode: codes.strandCode,
      subStrandCode: codes.subStrandCode,
      contentStandardCode: codes.contentStandardCode,
      indicatorCode: codes.indicatorCode,

      pageNumberInPdf:
        typeof row.sourcePage === "number" && Number.isInteger(row.sourcePage)
          ? row.sourcePage
          : 0,

      figureLabel: cleanText(row.caption) || undefined,
      imagePath: normalizedImagePath,
      altText: cleanText(row.altText),
      detailedDescription: cleanText(row.detailedDescription),
      tags: buildTags(row, mappedIndicatorCode, normalizedImagePath),
    };

    output.push(cleanRow);

    report.push({
      status: "kept",
      basename,
      oldIndicatorCode: cleanText(row.indicatorCode),
      newIndicatorCode: mappedIndicatorCode,
      note:
        cleanText(row.indicatorCode) === mappedIndicatorCode
          ? "Kept as-is."
          : "Remapped into clean KG hierarchy.",
    });
  }

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
        dropped: report.filter((r) => r.status === "dropped").length,
        kept: report.filter((r) => r.status === "kept").length,
        report,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(`✅ Wrote clean KG1 media JSON to: ${outputPath}`);
  console.log(`🧾 Wrote media cleanup report to: ${reportPath}`);
  console.log(`→ Input rows: ${parsed.length}`);
  console.log(`→ Output rows: ${output.length}`);
  console.log(`→ Dropped rows: ${report.filter((r) => r.status === "dropped").length}`);
}

main().catch((err) => {
  console.error("❌ Failed to canonicalize KG1 media JSON:", err);
  process.exit(1);
});