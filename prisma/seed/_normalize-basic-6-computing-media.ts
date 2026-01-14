import fs from "node:fs";
import path from "node:path";

type MediaRaw = {
  alt: string;
  url: string;
  source?: string;
  license?: string;
  indicatorCode: string;
};

type IndicatorRow = {
  indicator_id: string;
  indicator_code: string;
  indicator_description: string;
  indicator_order: number;
  content_standard_code: string;
  substrand_code: string;
  strand_code: string;
};

type MediaClean = {
  indicatorId: string;
  indicatorCode: string;
  indicatorDescription: string;
  pageNumberInPdf: number;
  figureLabel: null;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags: string;
};

const cwd = process.cwd();
const mediaPath =
  process.argv[2] ??
  path.join(cwd, "prisma", "seed", "curriculum", "basic-6-computing-media.json");
const indicatorsPath =
  process.argv[3] ??
  path.join(
    cwd,
    "prisma",
    "seed",
    "curriculum",
    "basic-6-computing-indicators.sql.json"
  );

const outPath =
  process.argv[4] ??
  path.join(
    cwd,
    "prisma",
    "seed",
    "curriculum",
    "basic-6-computing-media.clean.json"
  );

function readJson<T>(p: string): T {
  // Strip BOM + NUL just in case
  let s = fs.readFileSync(p, "utf8");
  s = s.replace(/^\uFEFF/, "").replace(/\u0000/g, "").trim();

  // If someone accidentally pasted junk before/after, hard-slice the array
  const first = s.indexOf("[");
  const last = s.lastIndexOf("]");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }

  return JSON.parse(s) as T;
}

function main() {
  console.log("🔧 Normalizing B6 Computing media → B5-compatible JSON");
  console.log("📖 media:", mediaPath);
  console.log("📖 indicators:", indicatorsPath);

  const media = readJson<MediaRaw[]>(mediaPath);
  const indicators = readJson<IndicatorRow[]>(indicatorsPath);

  if (!Array.isArray(media) || media.length === 0) {
    throw new Error("Media JSON must be a non-empty array.");
  }
  if (!Array.isArray(indicators) || indicators.length === 0) {
    throw new Error("Indicators JSON must be a non-empty array.");
  }

  const byCode = new Map<string, IndicatorRow>();
  for (const row of indicators) byCode.set(row.indicator_code, row);

  const tags = "curriculum,upper-primary,basic-6,computing";

  const clean: MediaClean[] = [];
  const missing: string[] = [];

  for (const m of media) {
    const code = m.indicatorCode?.trim();
    if (!code) continue;

    const ind = byCode.get(code);
    if (!ind) {
      missing.push(code);
      continue;
    }

    const desc = ind.indicator_description?.trim() || "";
    const altText = `Basic 6 Computing ${code}: ${desc}`;
    const detailedDescription = `Illustration for Basic 6 Computing indicator ${code} — ${desc}.`;

    clean.push({
      indicatorId: ind.indicator_id,
      indicatorCode: code,
      indicatorDescription: desc,
      pageNumberInPdf: 0,
      figureLabel: null,
      imagePath: m.url,
      altText,
      detailedDescription,
      tags,
    });
  }

  // Sort by indicator_order (source-of-truth), then code
  clean.sort((a, b) => {
    const ia = byCode.get(a.indicatorCode)?.indicator_order ?? 9999;
    const ib = byCode.get(b.indicatorCode)?.indicator_order ?? 9999;
    if (ia !== ib) return ia - ib;
    return a.indicatorCode.localeCompare(b.indicatorCode);
  });

  fs.writeFileSync(outPath, JSON.stringify(clean, null, 2), "utf8");

  console.log(`✅ Wrote clean JSON: ${outPath}`);
  console.log(`📦 Rows: ${clean.length}`);

  if (missing.length) {
    console.log(
      `⚠️ Missing indicator codes (media has them, indicators list doesn't):`,
      missing
    );
  }
}

main();
