import fs from "node:fs";
import path from "node:path";

type MediaIn = {
  indicatorCode: string;
  url?: string;
  image?: string;
  altText?: string;
  tags?: string;
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

function getArg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function must<T>(v: T | undefined | null, msg: string): T {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) throw new Error(msg);
  return v as T;
}

function main() {
  const mediaPath = path.resolve(
    getArg("media") ?? "prisma/seed/curriculum/basic-5-computing-media.json"
  );
  const sqlPath = path.resolve(
    getArg("sql") ?? "prisma/seed/curriculum/basic-5-computing-indicators.json"
  );
  const outPath = path.resolve(
    getArg("out") ?? "prisma/seed/curriculum/basic-5-computing-media.clean.json"
  );

  const subjectLabel = getArg("subject") ?? "Basic 5 Computing";

  const media = JSON.parse(fs.readFileSync(mediaPath, "utf8")) as MediaIn[];
  const sql = JSON.parse(fs.readFileSync(sqlPath, "utf8")) as SqlRow[];

  if (!Array.isArray(media) || media.length === 0) throw new Error("Media JSON must be a non-empty array.");
  if (!Array.isArray(sql) || sql.length === 0) throw new Error("SQL JSON must be a non-empty array.");

  // Build code -> {id, desc}
  const map = new Map<string, { id: string; desc: string }>();
  const duplicates: string[] = [];
  for (const r of sql) {
    const code = String(r.indicator_code ?? "").trim();
    const id = String(r.indicator_id ?? "").trim();
    const desc = String(r.indicator_description ?? "").trim();
    if (!code || !id) continue;

    if (map.has(code)) duplicates.push(code);
    else map.set(code, { id, desc });
  }
  if (duplicates.length) {
    throw new Error(`Duplicate indicator_code(s) inside SQL mapping: ${[...new Set(duplicates)].join(", ")}`);
  }

  const out: MediaOut[] = [];
  const missingCodes: string[] = [];
  const dupKey = new Set<string>();

  for (const m of media) {
    const code = String(m.indicatorCode ?? "").trim();
    if (!code) throw new Error(`Row missing indicatorCode: ${JSON.stringify(m)}`);

    const hit = map.get(code);
    if (!hit) {
      missingCodes.push(code);
      continue;
    }

    const imagePath = String(m.url ?? "").trim();
    if (!imagePath) throw new Error(`Missing url for ${code}`);

    const indicatorDescription = hit.desc || "";

    const altText =
      `${subjectLabel} ${code}: ${indicatorDescription}`.trim();

    const detailedDescription =
      `Illustration for ${subjectLabel} indicator ${code} — ${indicatorDescription}`.trim();

    const row: MediaOut = {
      indicatorId: hit.id,
      indicatorCode: code,
      indicatorDescription,
      pageNumberInPdf: 0,
      figureLabel: null,
      imagePath,
      altText,
      detailedDescription,
      tags: String(m.tags ?? "").trim(),
    };

    const k = `${row.indicatorId}|||${row.imagePath}`;
    if (dupKey.has(k)) throw new Error(`Duplicate media row detected (indicatorId+imagePath): ${k}`);
    dupKey.add(k);

    out.push(row);
  }

  if (missingCodes.length) {
    throw new Error(
      `These indicatorCode(s) exist in media JSON but not in SQL source-of-truth:\n- ${missingCodes.join("\n- ")}`
    );
  }

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log("✅ Wrote clean B4-style JSON:", outPath);
  console.log("📦 Rows:", out.length);
}

main();
