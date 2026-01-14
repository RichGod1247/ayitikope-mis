// prisma/seed/tools/rewrite-media-json-from-sql.ts
// Rewrites a media JSON (indicatorCode + url/image) into B4-style JSON
// using an "SQL source-of-truth" JSON that contains indicator_id + indicator_code + indicator_description.
// It overwrites the media file (with a timestamped backup).

import fs from "node:fs";
import path from "node:path";

type MediaIn = {
  indicatorCode: string;
  image?: string;
  url?: string;
  imagePath?: string;
  altText?: string;
  tags?: string;
  pageNumberInPdf?: number;
};

type SqlRow = {
  indicator_id: string;
  indicator_code: string;
  indicator_description: string;
};

type MediaOut = {
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

function arg(name: string) {
  const i = process.argv.findIndex((x) => x === `--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readJson<T>(p: string): T {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as T;
}

function main() {
  const mediaPath = path.resolve(
    arg("media") ??
      path.join(process.cwd(), "prisma", "seed", "curriculum", "basic-5-computing-media.json")
  );

  const sqlPath = path.resolve(
    arg("sql") ??
      path.join(process.cwd(), "prisma", "seed", "curriculum", "basic-5-computing-indicators.sql.json")
  );

  const subjectLabel = arg("subject") ?? "Basic 5 Computing";
  const defaultTags = arg("tags") ?? ""; // keep B4 SOP default empty tags
  const defaultPage = Number(arg("page") ?? "0");

  if (!fs.existsSync(mediaPath)) throw new Error(`Media JSON not found: ${mediaPath}`);
  if (!fs.existsSync(sqlPath)) throw new Error(`SQL JSON not found: ${sqlPath}`);

  const media = readJson<MediaIn[]>(mediaPath);
  const sql = readJson<SqlRow[]>(sqlPath);

  if (!Array.isArray(media) || !media.length) throw new Error("Media JSON is empty or not an array.");
  if (!Array.isArray(sql) || !sql.length) throw new Error("SQL JSON is empty or not an array.");

  const map = new Map<string, { id: string; desc: string }>();
  const dup: Record<string, string[]> = {};

  for (const r of sql) {
    const code = String(r.indicator_code ?? "").trim();
    const id = String(r.indicator_id ?? "").trim();
    const desc = String(r.indicator_description ?? "").trim();
    if (!code || !id) continue;

    if (map.has(code)) {
      dup[code] ??= [map.get(code)!.id];
      dup[code].push(id);
      continue;
    }
    map.set(code, { id, desc });
  }

  const dupKeys = Object.keys(dup);
  if (dupKeys.length) {
    console.log("⚠️ Duplicate codes inside SQL mapping (should not happen). Using first seen:");
    for (const k of dupKeys.slice(0, 20)) console.log(`⚠️ ${k}: ${dup[k].join(", ")}`);
  }

  const out: MediaOut[] = media.map((m) => {
    const code = String(m.indicatorCode ?? "").trim();
    if (!code) throw new Error(`Row missing indicatorCode: ${JSON.stringify(m)}`);

    const hit = map.get(code);
    if (!hit) throw new Error(`Code not found in SQL mapping: ${code}`);

    const imagePath = String(m.imagePath ?? m.url ?? m.image ?? "").trim();
    if (!imagePath) throw new Error(`Row missing image/url/imagePath for ${code}`);

    const indicatorDescription = hit.desc || code;

    const altText =
      `${subjectLabel} ${code}: ${indicatorDescription}`.trim();

    const detailedDescription =
      `Illustration for ${subjectLabel} indicator ${code} — ${indicatorDescription}`.trim();

    return {
      indicatorId: hit.id,
      indicatorCode: code,
      indicatorDescription,
      pageNumberInPdf: Number.isFinite(m.pageNumberInPdf as number) ? (m.pageNumberInPdf as number) : defaultPage,
      figureLabel: null,
      imagePath,
      altText,
      detailedDescription,
      tags: (m.tags ?? defaultTags).trim(),
    };
  });

  const backup = mediaPath.replace(/\.json$/i, `.bak.${Date.now()}.json`);
  fs.copyFileSync(mediaPath, backup);
  fs.writeFileSync(mediaPath, JSON.stringify(out, null, 2), "utf8");

  console.log("✅ Rewritten media JSON to B4-style format.");
  console.log("🗂️ Backup:", backup);
  console.log("📄 Output:", mediaPath);
  console.log("📦 Rows:", out.length);
}

main();
