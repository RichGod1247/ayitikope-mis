// prisma/seed/basic-1-history-media.ts
// Media seeder for Basic 1 History (idempotent + --check mode)
// Handles tags being either String[] OR String (auto-fallback).

// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUBJECT_SLUG = "basic-1-history";
const MEDIA_JSON_FILE = "basic-1-history-media.json";

// Your public folder convention
const PUBLIC_MEDIA_DIR_URL =
  "/curriculum/lower-primary/basic-1/basic-1-history";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");

const CHECK_ONLY = process.argv.includes("--check");
const STRICT = true;

const models = {
  subject: (prisma as any).curriculumSubject ?? (prisma as any).subject ?? null,
  strand: (prisma as any).curriculumStrand ?? (prisma as any).strand ?? null,
  subStrand:
    (prisma as any).curriculumSubStrand ??
    (prisma as any).subStrand ??
    (prisma as any).curriculumSubstrand ??
    (prisma as any).substrand ??
    null,
  contentStandard:
    (prisma as any).curriculumContentStandard ??
    (prisma as any).contentStandard ??
    (prisma as any).curriculumStandard ??
    (prisma as any).standard ??
    null,
  indicator:
    (prisma as any).curriculumIndicator ?? (prisma as any).indicator ?? null,
  media: (prisma as any).curriculumMedia ?? (prisma as any).media ?? null,
};

function ensureRequiredModels() {
  const missing: string[] = [];
  if (!models.subject) missing.push("subject");
  if (!models.strand) missing.push("strand");
  if (!models.subStrand) missing.push("subStrand");
  if (!models.contentStandard) missing.push("contentStandard");
  if (!models.indicator) missing.push("indicator");
  if (!models.media) missing.push("media");

  if (missing.length) {
    const available = Object.keys(prisma as any).join(", ");
    throw new Error(
      `Required Prisma models missing: ${missing.join(
        ", "
      )}.\nAvailable prisma delegates: ${available}`
    );
  }
}

type MediaRow = {
  subjectSlug: string;
  strandCode: string;
  subStrandCode: string;
  contentStandardCode: string;
  indicatorCode: string;
  imageFileBase: string;
  pageNumberInPdf?: number;
  altText: string;
  detailedDescription?: string;
  tags?: any; // can be string[] or string
};

async function loadRows(): Promise<MediaRow[]> {
  const filePath = path.join(__dirname, "curriculum", MEDIA_JSON_FILE);
  console.log(`📦 Loading media JSON from: ${filePath}`);
  const raw = await fs.readFile(filePath, "utf8");
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error("Media JSON must be an array.");
  console.log(`✅ Items in JSON: ${rows.length}`);
  return rows;
}

async function resolveImagePath(imageFileBase: string): Promise<string | null> {
  const exts = ["png", "webp", "jpg", "jpeg"];
  for (const ext of exts) {
    const urlPath = `${PUBLIC_MEDIA_DIR_URL}/${imageFileBase}.${ext}`;
    const fsPath = path.join(PUBLIC_DIR, urlPath.replace(/^\//, ""));
    try {
      await fs.access(fsPath);
      return urlPath;
    } catch {}
  }
  return null;
}

async function findIndicatorByFullChain(row: MediaRow) {
  const subject = await models.subject.findUnique({
    where: { slug: row.subjectSlug },
  });
  if (!subject) return { indicator: null, reason: `Subject not found` };

  const strand = await models.strand.findFirst({
    where: { subjectId: subject.id, code: row.strandCode },
  });
  if (!strand) return { indicator: null, reason: `Strand not found` };

  const subStrand = await models.subStrand.findFirst({
    where: { strandId: strand.id, code: row.subStrandCode },
  });
  if (!subStrand) return { indicator: null, reason: `SubStrand not found` };

  const cs = await models.contentStandard.findFirst({
    where: { subStrandId: subStrand.id, code: row.contentStandardCode },
  });
  if (!cs) return { indicator: null, reason: `ContentStandard not found` };

  const indicator = await models.indicator.findFirst({
    where: { contentStandardId: cs.id, code: row.indicatorCode },
  });
  if (!indicator) return { indicator: null, reason: `Indicator not found` };

  return { indicator, reason: null };
}

function tagsToString(tags: any): string | null {
  if (tags == null) return null;
  if (typeof tags === "string") return tags;
  if (Array.isArray(tags)) return JSON.stringify(tags);
  // last resort
  return JSON.stringify([String(tags)]);
}

async function createOrUpdateMedia({
  indicatorId,
  imagePath,
  row,
}: {
  indicatorId: string;
  imagePath: string;
  row: MediaRow;
}) {
  const existing = await models.media.findFirst({
    where: { indicatorId, imagePath },
  });

  const baseData: any = {
    indicatorId,
    imagePath,
    altText: row.altText,
    detailedDescription: row.detailedDescription ?? "",
    pageNumberInPdf: row.pageNumberInPdf ?? null,
  };

  // Attempt 1: tags as-is (array-friendly)
  const attempt1: any = {
    ...baseData,
    tags: row.tags ?? null,
  };

  // Attempt 2: tags stringified (string-friendly)
  const attempt2: any = {
    ...baseData,
    tags: tagsToString(row.tags),
  };

  const doCreate = async (data: any) => models.media.create({ data });
  const doUpdate = async (id: string, data: any) =>
    models.media.update({ where: { id }, data });

  try {
    if (existing) {
      await doUpdate(existing.id, attempt1);
      return { action: "update", mode: "attempt1" };
    } else {
      await doCreate(attempt1);
      return { action: "create", mode: "attempt1" };
    }
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // Only fallback when Prisma complains about tags shape
    if (msg.includes("Argument `tags`") || msg.includes("Expected String")) {
      if (existing) {
        await doUpdate(existing.id, attempt2);
        return { action: "update", mode: "fallback-string" };
      } else {
        await doCreate(attempt2);
        return { action: "create", mode: "fallback-string" };
      }
    }
    throw e;
  }
}

async function main() {
  ensureRequiredModels();

  const rows = await loadRows();

  console.log(
    CHECK_ONLY
      ? `🔎 CHECK MODE: verifying indicators + files for ${SUBJECT_SLUG} (no writes)`
      : `🚀 Seeding CurriculumMedia for ${SUBJECT_SLUG}`
  );

  const missingIndicators: string[] = [];
  const missingFiles: string[] = [];

  for (const row of rows) {
    const { indicator, reason } = await findIndicatorByFullChain(row);
    if (!indicator) {
      console.warn(`⚠️ Missing indicator ${row.indicatorCode}: ${reason}`);
      missingIndicators.push(`${row.indicatorCode} (${reason})`);
      continue;
    }

    const imagePath = await resolveImagePath(row.imageFileBase);
    if (!imagePath) {
      const expected = `${PUBLIC_MEDIA_DIR_URL}/${row.imageFileBase}.[png|webp|jpg|jpeg]`;
      console.warn(`⚠️ Missing image file for ${row.indicatorCode}: ${expected}`);
      missingFiles.push(`${row.indicatorCode}: ${expected}`);
      continue;
    }

    if (CHECK_ONLY) {
      console.log(
        `✅ OK: ${row.indicatorCode} → indicatorId=${indicator.id}, image=${imagePath}`
      );
      continue;
    }

    const result = await createOrUpdateMedia({
      indicatorId: indicator.id,
      imagePath,
      row,
    });

    const icon = result.action === "create" ? "➕" : "♻️";
    const note = result.mode === "fallback-string" ? " (tags→string)" : "";
    console.log(`${icon} ${result.action}d: ${row.indicatorCode} → ${imagePath}${note}`);
  }

  if (missingIndicators.length) {
    console.error("\n❌ Missing indicators:");
    for (const m of missingIndicators) console.error(" - " + m);
  }

  if (missingFiles.length) {
    console.error("\n❌ Missing image files:");
    for (const m of missingFiles) console.error(" - " + m);
  }

  if ((missingIndicators.length || missingFiles.length) && STRICT) {
    process.exitCode = 1;
  } else {
    console.log("🎉 Done.");
  }
}

main()
  .catch((e) => {
    console.error("❌ Media seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
