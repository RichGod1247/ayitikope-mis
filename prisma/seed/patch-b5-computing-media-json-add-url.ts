import fs from "fs";
import path from "path";

const DEFAULT_R2_PUBLIC_BASE =
  "https://17eb5dd5e7e556ca8a1b80b972546fa.r2.cloudflarestorage.com/curriculum";

const R2_PUBLIC_BASE =
  (process.env.R2_PUBLIC_BASE_URL ?? DEFAULT_R2_PUBLIC_BASE).replace(/\/+$/, "");

function findJson(): string {
  const dir = path.join(process.cwd(), "prisma", "seed", "curriculum");
  if (!fs.existsSync(dir)) throw new Error(`Missing dir: ${dir}`);

  const candidates = fs
    .readdirSync(dir)
    .filter((f) => /b5.*computing.*media.*\.json$/i.test(f));

  if (candidates.length === 0) {
    throw new Error(
      `No B5 computing media json found in ${dir}. Expected something like b5-computing-media.json`
    );
  }

  // pick first deterministically
  return path.join(dir, candidates.sort()[0]);
}

type Row = {
  indicatorCode: string;
  image: string;   // relative key/path (your existing field)
  url?: string;    // will be added
  altText?: string;
  tags?: string;
};

const jsonPath = process.argv[2] ? path.resolve(process.argv[2]) : findJson();

if (!fs.existsSync(jsonPath)) throw new Error(`JSON not found: ${jsonPath}`);

const rows: Row[] = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const patched = rows.map((r) => ({
  ...r,
  url: r.url ?? `${R2_PUBLIC_BASE}/${String(r.image).replace(/^\/+/, "")}`,
}));

fs.writeFileSync(jsonPath, JSON.stringify(patched, null, 2), "utf8");
console.log(`✅ Added url to ${patched.length} rows -> ${jsonPath}`);
console.log(`✅ Base used: ${R2_PUBLIC_BASE}`);
