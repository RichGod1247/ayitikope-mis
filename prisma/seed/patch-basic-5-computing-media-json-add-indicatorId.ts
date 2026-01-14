// prisma/seed/patch-basic-5-computing-media-json-add-indicatorId.ts
import { PrismaClient, Prisma } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const SUBJECT_SLUG = "basic-5-computing";

// Default JSON path (your SOP)
const DEFAULT_JSON = path.join(
  process.cwd(),
  "prisma",
  "seed",
  "curriculum",
  "basic-5-computing-media.json"
);

type InRow = {
  indicatorCode: string;
  image?: string;
  imagePath?: string;
  altText?: string;
  tags?: string;
  url?: string;
  pageNumberInPdf?: number;
};

type OutRow = {
  indicatorId: string;
  indicatorCode: string;
  imagePath: string;
  altText: string;
  tags: string;
  pageNumberInPdf: number;
  url?: string;
};

function readJsonStrict(filePath: string): InRow[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("JSON root must be an array.");
  return parsed as InRow[];
}

function normalizeBaseUrl(s?: string) {
  if (!s) return null;
  return s.replace(/\/+$/, "");
}

function findRelationPath(fromModel: string, toModel: string): string[] {
  const models = Prisma.dmmf.datamodel.models;
  const byName = new Map(models.map((m) => [m.name, m] as const));

  const queue: string[] = [fromModel];
  const prev = new Map<string, { from: string; field: string } | null>();
  prev.set(fromModel, null);

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === toModel) break;

    const m = byName.get(cur);
    if (!m) continue;

    for (const f of m.fields ?? []) {
      // Relations appear as kind === "object"
      if (f.kind !== "object") continue;
      const next = String(f.type);
      if (!byName.has(next)) continue;
      if (prev.has(next)) continue;
      prev.set(next, { from: cur, field: f.name });
      queue.push(next);
    }
  }

  if (!prev.has(toModel)) {
    throw new Error(
      `Could not find a relation path from ${fromModel} -> ${toModel} in Prisma DMMF.`
    );
  }

  // Reconstruct path as field names from fromModel -> toModel
  const pathFields: string[] = [];
  let cur = toModel;

  while (cur !== fromModel) {
    const p = prev.get(cur);
    if (!p) break;
    pathFields.unshift(p.field);
    cur = p.from;
  }

  return pathFields;
}

function buildInclude(pathFields: string[]) {
  // Builds: { a: { include: { b: { include: { c: { select: { id, slug }}}}}}}
  const include: any = {};
  let cursor = include;

  for (let i = 0; i < pathFields.length; i++) {
    const key = pathFields[i];
    const isLast = i === pathFields.length - 1;

    if (isLast) {
      cursor[key] = { select: { id: true, slug: true } };
    } else {
      cursor[key] = { include: {} };
      cursor = cursor[key].include;
    }
  }

  return include;
}

function getNested(obj: any, pathFields: string[]) {
  let cur = obj;
  for (const k of pathFields) {
    cur = cur?.[k];
    if (!cur) return null;
  }
  return cur;
}

async function main() {
  const jsonPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_JSON;
  if (!fs.existsSync(jsonPath)) throw new Error(`JSON not found: ${jsonPath}`);

  const baseUrl = normalizeBaseUrl(process.env.R2_PUBLIC_BASE_URL || "");
  const rows = readJsonStrict(jsonPath);

  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: SUBJECT_SLUG },
    select: { id: true, slug: true, name: true },
  });
  if (!subject) throw new Error(`Subject not found: ${SUBJECT_SLUG}`);

  // Find a stable relation path Indicator -> Subject (no hardcoded field names)
  const pathFields = findRelationPath("CurriculumIndicator", "CurriculumSubject");
  const include = buildInclude(pathFields);

  const codes = Array.from(
    new Set(rows.map((r) => String(r.indicatorCode || "").trim()).filter(Boolean))
  );

  // Pull ALL indicators for these codes, then filter to THIS subject via relation path
  const indicators = await (prisma as any).curriculumIndicator.findMany({
    where: { code: { in: codes } },
    include,
  });

  // Map code -> indicatorId for indicators that belong to basic-5-computing
  const codeToId = new Map<string, string[]>();

  for (const ind of indicators) {
    const subj = getNested(ind, pathFields);
    if (!subj?.slug) continue;
    if (subj.slug !== subject.slug) continue;

    const arr = codeToId.get(ind.code) ?? [];
    arr.push(ind.id);
    codeToId.set(ind.code, arr);
  }

  // Hard guard: within THIS subject, each code must map to exactly 1 indicatorId
  const collisions = [...codeToId.entries()].filter(([, ids]) => ids.length > 1);
  if (collisions.length) {
    throw new Error(
      `Within subject "${SUBJECT_SLUG}", these indicator codes still map to multiple indicatorIds (bad seed duplication):\n` +
        collisions
          .slice(0, 20)
          .map(([c, ids]) => `- ${c}: ${ids.join(", ")}`)
          .join("\n")
    );
  }

  const patched: OutRow[] = rows.map((r) => {
    const indicatorCode = String(r.indicatorCode || "").trim();
    const imagePath = String(r.imagePath ?? r.image ?? "").trim();
    if (!indicatorCode) throw new Error(`Row missing indicatorCode: ${JSON.stringify(r)}`);
    if (!imagePath) throw new Error(`Row missing image/imagePath for ${indicatorCode}`);

    const ids = codeToId.get(indicatorCode) ?? [];
    if (ids.length !== 1) {
      throw new Error(
        `Could not uniquely resolve indicatorId for code=${indicatorCode} in subject=${SUBJECT_SLUG}. ` +
          `Resolved ids count=${ids.length}.`
      );
    }

    const altText = String(r.altText ?? indicatorCode).trim();
    const tags = String(r.tags ?? "curriculum,upper-primary,basic-5,computing").trim();
    const pageNumberInPdf =
      typeof r.pageNumberInPdf === "number" ? r.pageNumberInPdf : 0;

    const out: OutRow = {
      indicatorId: ids[0],
      indicatorCode,
      imagePath,
      altText,
      tags,
      pageNumberInPdf,
    };

    if (baseUrl) out.url = `${baseUrl}/${imagePath}`;
    return out;
  });

  // Backup then overwrite
  const backup = jsonPath.replace(/\.json$/i, `.bak.${Date.now()}.json`);
  fs.copyFileSync(jsonPath, backup);

  fs.writeFileSync(jsonPath, JSON.stringify(patched, null, 2), "utf8");
  console.log(`✅ Patched JSON written: ${jsonPath}`);
  console.log(`🗂️ Backup saved: ${backup}`);
  console.log(`→ Rows: ${patched.length}`);
}

main()
  .catch((e) => {
    console.error("💥 Patch failed:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
