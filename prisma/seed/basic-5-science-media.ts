// prisma/seed/basic-5-science-media.ts
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

type MediaSeedRow = {
  indicatorId: string;
  indicatorCode: string;
  indicatorDescription: string;
  pageNumberInPdf?: number;
  figureLabel?: string | null;
  imagePath: string;
  altText: string;
  detailedDescription: string;
  tags?: string;
};

const prisma = new PrismaClient();

const SUBJECT_SLUG = "basic-5-science";
const JSON_PATH = path.join(
  process.cwd(),
  "prisma",
  "seed",
  "curriculum",
  "basic-5-science-media.json"
);

async function getSubjectOrThrow() {
  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: SUBJECT_SLUG },
    select: { id: true, phase: true, level: true, name: true, slug: true },
  });

  if (!subject) {
    throw new Error(
      `Subject not found for slug "${SUBJECT_SLUG}". Seed the curriculum subject first.`
    );
  }
  return subject;
}

function readJsonFileOrThrow(filePath: string): MediaSeedRow[] {
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw || !raw.trim()) {
    throw new Error(`JSON file is empty: ${filePath}`);
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`JSON root must be an array. Got: ${typeof parsed}`);
    }
    return parsed as MediaSeedRow[];
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    throw new Error(`Failed to parse JSON at ${filePath}: ${msg}`);
  }
}

async function resolveIndicatorId(
  subjectId: string,
  row: MediaSeedRow
): Promise<string | null> {
  // 1) Prefer indicatorId from canonical SQL (but validate it belongs to this subject)
  const byId = await prisma.curriculumIndicator.findUnique({
    where: { id: row.indicatorId },
    select: {
      id: true,
      code: true,
      contentStandard: {
        select: {
          subStrand: {
            select: {
              strand: {
                select: {
                  subjectId: true,
                  subject: { select: { slug: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const byIdSubjectId =
    byId?.contentStandard?.subStrand?.strand?.subjectId ?? null;

  if (byId && byId.code === row.indicatorCode && byIdSubjectId === subjectId) {
    return byId.id;
  }

  // 2) Fallback: find by code BUT constrained to this subject tree (collision-safe)
  const byCode = await prisma.curriculumIndicator.findFirst({
    where: {
      code: row.indicatorCode,
      contentStandard: {
        subStrand: {
          strand: {
            subjectId: subjectId,
          },
        },
      },
    },
    select: { id: true },
  });

  return byCode?.id ?? null;
}

function assertNoDuplicateCodes(rows: MediaSeedRow[]) {
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.indicatorId || !r.indicatorCode || !r.imagePath) {
      throw new Error(
        `Invalid row (missing indicatorId/indicatorCode/imagePath): ${JSON.stringify(
          r
        )}`
      );
    }
    if (seen.has(r.indicatorCode)) {
      throw new Error(`Duplicate indicatorCode in JSON: ${r.indicatorCode}`);
    }
    seen.add(r.indicatorCode);
  }
}

async function upsertByImagePathSafely(args: {
  subjectId: string;
  indicatorId: string;
  row: MediaSeedRow;
}) {
  const { subjectId, indicatorId, row } = args;

  // imagePath is NOT unique in schema, so we must not use Prisma upsert-by-imagePath.
  // Instead: find rows with this imagePath, then update/create by id.
  const existing = await prisma.curriculumMedia.findMany({
    where: { imagePath: row.imagePath },
    select: { id: true, indicatorId: true },
  });

  const data = {
    subjectId: subjectId,
    indicatorId: indicatorId,
    imagePath: row.imagePath,
    altText: row.altText,
    detailedDescription: row.detailedDescription,
    tags: row.tags ?? "",
    pageNumberInPdf: typeof row.pageNumberInPdf === "number" ? row.pageNumberInPdf : 0,
    figureLabel: row.figureLabel ?? null,
  };

  if (existing.length === 0) {
    await prisma.curriculumMedia.create({ data });
    return { action: "created" as const };
  }

  // If there are multiple rows (shouldn't happen), keep the best candidate and delete the rest.
  const keep =
    existing.find((m) => m.indicatorId === indicatorId) ?? existing[0];

  const toDelete = existing.filter((m) => m.id !== keep.id).map((m) => m.id);

  if (toDelete.length > 0) {
    await prisma.curriculumMedia.deleteMany({
      where: { id: { in: toDelete } },
    });
  }

  await prisma.curriculumMedia.update({
    where: { id: keep.id },
    data,
  });

  return { action: "updated" as const, deduped: toDelete.length };
}

async function main() {
  const subject = await getSubjectOrThrow();

  console.log(
    `\n📘 Subject: ${subject.name} (${subject.slug}) | ${subject.phase} / ${subject.level}`
  );
  console.log(`📖 Loading media seed JSON from: ${JSON_PATH}`);

  const rows = readJsonFileOrThrow(JSON_PATH);
  assertNoDuplicateCodes(rows);

  // Normalize JSON snapshot (prevents truncation/format drift)
  fs.writeFileSync(JSON_PATH, JSON.stringify(rows, null, 2), "utf8");
  console.log(`🧾 Verified + normalized JSON snapshot: ${JSON_PATH}`);
  console.log(`→ Rows: ${rows.length}\n`);

  let created = 0;
  let updated = 0;
  let deduped = 0;
  let attachedToIndicators = 0;
  let missingIndicators = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const indicatorId = await resolveIndicatorId(subject.id, row);

      if (!indicatorId) {
        missingIndicators++;
        console.warn(
          `⚠️  ${row.indicatorCode} -> indicator not found under subject "${SUBJECT_SLUG}" (collision-protected). Skipping.`
        );
        continue;
      }

      const res = await upsertByImagePathSafely({
        subjectId: subject.id,
        indicatorId,
        row,
      });

      if (res.action === "created") created++;
      if (res.action === "updated") updated++;
      if ("deduped" in res) deduped += res.deduped ?? 0;

      attachedToIndicators++;
      console.log(`✅ ${row.indicatorCode} -> media saved`);
    } catch (e: any) {
      failed++;
      console.error(
        `❌ ${row.indicatorCode} -> failed: ${e?.message ?? String(e)}`
      );
    }
  }

  console.log(`\n📦 Basic 5 Science media seeding complete.`);
  console.log({
    totalRows: rows.length,
    created,
    updated,
    deduped,
    attachedToIndicators,
    missingIndicators,
    failed,
  });

  if (missingIndicators > 0 || failed > 0) {
    throw new Error(
      `Seed completed with issues (missingIndicators=${missingIndicators}, failed=${failed}). Do NOT proceed until SQL verification is green.`
    );
  }
}

main()
  .catch((e) => {
    console.error("\n🚨 Seed failed:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
