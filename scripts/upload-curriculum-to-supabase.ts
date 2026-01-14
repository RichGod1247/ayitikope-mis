// scripts/upload-curriculum-to-supabase.ts
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const ROOT_DIR = path.resolve(process.cwd(), "public", "curriculum");

const BUCKET = process.env.CURRICULUM_BUCKET || "curriculum";
const UPSERT = (process.env.CURRICULUM_UPLOAD_UPSERT || "true").toLowerCase() === "true";
const CONCURRENCY = Math.max(1, Number(process.env.CURRICULUM_UPLOAD_CONCURRENCY || "5"));

const UPDATE_DB = (process.env.CURRICULUM_UPDATE_DB || "true").toLowerCase() === "true";
const DB_SCHEMA = process.env.CURRICULUM_DB_SCHEMA || "edulife_os";
const DB_TABLE = process.env.CURRICULUM_DB_TABLE || "CurriculumMedia";
const DB_IMAGE_FIELD = process.env.CURRICULUM_DB_IMAGE_FIELD || "imagePath";

// Accept either SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL (your env uses NEXT_PUBLIC_SUPABASE_URL)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Fatal: Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type UploadStatus = "uploaded" | "skipped" | "failed";

type UploadResult = {
  relPath: string;
  objectPath: string;
  status: UploadStatus;
  error?: string;
  publicUrl?: string;
  dbUpdated?: number;
};

function toPosix(p: string) {
  return p.split(path.sep).join("/");
}

function isMediaFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext);
}

function mimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

/**
 * Get a schema-aware query builder if supported by your supabase-js version.
 * - supabase-js v2 supports supabase.schema("edulife_os")
 * - older typings might not, so we fall back gracefully.
 */
function getDbClient(): any {
  const anySb = supabase as any;
  if (typeof anySb.schema === "function") return anySb.schema(DB_SCHEMA);
  // Fallback: no schema support -> you can only update if your table is in public or exposed differently
  return anySb;
}

async function tryUpdateDbImagePath(relPosix: string, publicUrl: string): Promise<number> {
  const db = getDbClient();

  // What your DB might already contain from earlier “local path” seeding
  const candidates = [
    `/curriculum/${relPosix}`,
    `curriculum/${relPosix}`,
    relPosix,
    `public/curriculum/${relPosix}`,
    `/public/curriculum/${relPosix}`,
  ];

  const q = db
    .from(DB_TABLE)
    .update({
      [DB_IMAGE_FIELD]: publicUrl,
      updatedAt: new Date().toISOString(),
    })
    .in(DB_IMAGE_FIELD, candidates)
    .select("id"); // <-- single arg only (compatible with your TS types)

  const { data, error } = await q;
  if (error) throw error;

  return Array.isArray(data) ? data.length : 0;
}

async function uploadOne(filePath: string): Promise<UploadResult> {
  const rel = toPosix(path.relative(ROOT_DIR, filePath));
  const objectPath = rel;

  try {
    const buf = await fs.readFile(filePath);
    const contentType = mimeFromExt(filePath);

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectPath, buf, {
      contentType,
      upsert: UPSERT,
    });

    // If upsert is false and object exists, treat as skipped
    if (upErr) {
      const msg = String((upErr as any).message || upErr);
      const looksLikeExists =
        msg.toLowerCase().includes("already exists") ||
        msg.toLowerCase().includes("duplicate") ||
        msg.includes("409");

      if (!UPSERT && looksLikeExists) {
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
        const publicUrl = urlData?.publicUrl;

        let dbUpdated = 0;
        if (UPDATE_DB && publicUrl) {
          try {
            dbUpdated = await tryUpdateDbImagePath(rel, publicUrl);
          } catch {
            // swallow: schema might not be exposed to API; uploads still successful
          }
        }

        return { relPath: rel, objectPath, status: "skipped", publicUrl, dbUpdated };
      }

      return { relPath: rel, objectPath, status: "failed", error: msg };
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    const publicUrl = urlData?.publicUrl;

    let dbUpdated = 0;
    if (UPDATE_DB && publicUrl) {
      try {
        dbUpdated = await tryUpdateDbImagePath(rel, publicUrl);
      } catch {
        // schema might not be exposed to API; handled in main()
      }
    }

    return { relPath: rel, objectPath, status: "uploaded", publicUrl, dbUpdated };
  } catch (e: any) {
    return {
      relPath: rel,
      objectPath,
      status: "failed",
      error: String(e?.message || e),
    };
  }
}

async function runPool<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function runner() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await worker(items[current]);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runner());
  await Promise.all(runners);
  return results;
}

async function main() {
  console.log("📦 Curriculum upload starting...");
  console.log(`- Local root: ${ROOT_DIR}`);
  console.log(`- Bucket: ${BUCKET}`);
  console.log(`- Upsert: ${UPSERT}`);
  console.log(`- Concurrency: ${CONCURRENCY}`);
  console.log(`- Update DB: ${UPDATE_DB ? `YES (${DB_SCHEMA}.${DB_TABLE}.${DB_IMAGE_FIELD})` : "NO"}`);

  // Ensure local folder exists
  try {
    const stat = await fs.stat(ROOT_DIR);
    if (!stat.isDirectory()) throw new Error("public/curriculum is not a directory");
  } catch {
    console.error(`Fatal: Folder not found: ${ROOT_DIR}`);
    process.exit(1);
  }

  // Gather files
  const all = await walk(ROOT_DIR);
  const files = all.filter(isMediaFile);
  console.log(`🔎 Found ${files.length} media files under public/curriculum`);

  // DB accessibility warning (best-effort)
  if (UPDATE_DB) {
    try {
      const db = getDbClient();
      const { error } = await db.from(DB_TABLE).select("id").limit(1);
      if (error) {
        console.warn(
          `⚠️ DB update is ON but Supabase API can't read ${DB_SCHEMA}.${DB_TABLE}.\n` +
            `   Uploads will still work. If you want DB updates, expose schema "${DB_SCHEMA}" in Supabase API settings.`
        );
      }
    } catch {
      console.warn(
        `⚠️ DB update is ON but Supabase API schema access check failed.\n` +
          `   Uploads will still work. If DB updates don’t happen, expose schema "${DB_SCHEMA}" in Supabase API settings.`
      );
    }
  }

  const startedAt = Date.now();
  const results = await runPool(files, uploadOne, CONCURRENCY);
  const seconds = Math.round((Date.now() - startedAt) / 1000);

  const uploaded = results.filter((r) => (r as any).status === "uploaded").length;
  const skipped = results.filter((r) => (r as any).status === "skipped").length;
  const failed = results.filter((r) => (r as any).status === "failed").length;
  const dbUpdatedTotal = results.reduce((sum, r) => sum + ((r as any).dbUpdated || 0), 0);

  console.log("\n✅ Done");
  console.log(`- Uploaded: ${uploaded}`);
  console.log(`- Skipped:  ${skipped}`);
  console.log(`- Failed:   ${failed}`);
  console.log(`- DB rows updated (best-effort): ${dbUpdatedTotal}`);
  console.log(`- Time: ${seconds}s`);

  if (failed > 0) {
    console.log("\n❌ Failures (first 25):");
    results
      .filter((r) => (r as any).status === "failed")
      .slice(0, 25)
      .forEach((r: any) => console.log(`- ${r.relPath} :: ${r.error}`));
  }

  console.log(`\nNext: Supabase Dashboard → Storage → bucket "${BUCKET}" to confirm objects exist.`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
