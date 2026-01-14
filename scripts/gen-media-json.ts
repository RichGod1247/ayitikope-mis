import * as fs from "fs";
import * as path from "path";

type MediaSeedRow = {
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

type IndicatorMeta = {
  description: string;
  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (key: string) => {
    const i = args.indexOf(key);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const localFolder = get("--localFolder");
  const remotePrefix = get("--remotePrefix");
  const curriculumJson = get("--curriculumJson");
  const outJson = get("--outJson");
  const subjectSlug = get("--subjectSlug");
  const phase = get("--phase") ?? "Lower Primary";
  const level = get("--level") ?? "Basic 1";

  if (!localFolder || !remotePrefix || !curriculumJson || !outJson || !subjectSlug) {
    console.error(`
Usage:
npx ts-node scripts/gen-media-json.ts ^
  --localFolder "<path>" ^
  --remotePrefix "<prefix>" ^
  --curriculumJson "<path-to-curriculum-json>" ^
  --outJson "<path-to-output-json>" ^
  --subjectSlug "<subject-slug>" ^
  --phase "Lower Primary" ^
  --level "Basic 1"
`);
    process.exit(1);
  }

  return { localFolder, remotePrefix, curriculumJson, outJson, subjectSlug, phase, level };
}

function buildIndicatorMetaMap(curriculum: any) {
  const map = new Map<string, IndicatorMeta>();

  const strands = curriculum?.strands ?? [];
  for (const strand of strands) {
    const strandCode = strand?.code;
    const subStrands = strand?.subStrands ?? [];
    for (const subStrand of subStrands) {
      const subStrandCode = subStrand?.code;
      const contentStandards = subStrand?.contentStandards ?? [];
      for (const cs of contentStandards) {
        const contentStandardCode = cs?.code;
        const indicators = cs?.indicators ?? [];
        for (const ind of indicators) {
          const code = ind?.code;
          const desc = ind?.description;
          if (!code) continue;

          map.set(code, {
            description: desc ?? "",
            strandCode: strandCode ?? "",
            subStrandCode: subStrandCode ?? "",
            contentStandardCode: contentStandardCode ?? "",
          });
        }
      }
    }
  }

  return map;
}

function safeSplitParts(indicatorCode: string) {
  // Accepts things like B6.1.8.1.11 (normal) and also odd shorter/longer codes.
  const parts = indicatorCode.split(".").filter(Boolean);
  if (parts.length < 2) throw new Error(`Bad indicator code: ${indicatorCode}`);
  const strandCode = parts.length >= 2 ? parts.slice(0, 2).join(".") : parts.join(".");
  const subStrandCode = parts.length >= 3 ? parts.slice(0, 3).join(".") : strandCode;
  const contentStandardCode = parts.length >= 4 ? parts.slice(0, 4).join(".") : subStrandCode;
  return { strandCode, subStrandCode, contentStandardCode };
}

function tagsFromText(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/[^a-z0-9]/g, ""))
        .filter((w) => w.length >= 3)
    )
  ).slice(0, 10);
}

function joinPosix(a: string, b: string) {
  const aa = a.replace(/\/+$/, "");
  const bb = b.replace(/^\/+/, "");
  return `${aa}/${bb}`;
}

async function main() {
  const { localFolder, remotePrefix, curriculumJson, outJson, subjectSlug, phase, level } =
    parseArgs();

  const curriculumRaw = fs.readFileSync(curriculumJson, "utf8");
  const curriculum = JSON.parse(curriculumRaw);
  const metaMap = buildIndicatorMetaMap(curriculum);

  const files = fs
    .readdirSync(localFolder)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  const rows: MediaSeedRow[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    const base = path.basename(file, ".png");
    const indicatorCode = base.split("-")[0].trim(); // supports "CODE-anything.png" too

    const meta = metaMap.get(indicatorCode);
    const fallbackParts = !meta ? safeSplitParts(indicatorCode) : null;

    const strandCode = meta?.strandCode || fallbackParts!.strandCode;
    const subStrandCode = meta?.subStrandCode || fallbackParts!.subStrandCode;
    const contentStandardCode = meta?.contentStandardCode || fallbackParts!.contentStandardCode;

    const indicatorDesc = (meta?.description?.trim() || "").length
      ? meta!.description.trim()
      : indicatorCode;

    if (!meta) warnings.push(`⚠️ Indicator not found in curriculum JSON: ${indicatorCode}`);

    const imagePath = joinPosix(remotePrefix, file);

    rows.push({
      subjectSlug,
      phase,
      level,
      strandCode,
      subStrandCode,
      contentStandardCode,
      indicatorCode,
      pageNumberInPdf: 0,
      figureLabel: undefined,
      imagePath,
      altText: `Illustration for ${indicatorCode}: ${indicatorDesc}.`,
      detailedDescription:
        `A clear, child-friendly, Ghana-context illustration supporting indicator ${indicatorCode} (${indicatorDesc}). ` +
        `Use it to spark observation, questioning, and practical discussion—not rote memorization.`,
      tags: tagsFromText(indicatorDesc),
    });
  }

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(rows, null, 2), "utf8");

  console.log("✅ Media JSON generated:", outJson);
  console.log("   Files found:", files.length);
  if (warnings.length) {
    console.log("— Warnings —");
    for (const w of warnings) console.log(w);
  }
}

main().catch((e) => {
  console.error("❌ gen-media-json failed:", e);
  process.exit(1);
});
