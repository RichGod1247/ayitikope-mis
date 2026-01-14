import fs from "fs";
import path from "path";

const DEFAULT_R2_PUBLIC_BASE =
  "https://17eb5dd5e7e556ca8a1b80b972546fa.r2.cloudflarestorage.com/curriculum";
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE_URL ?? DEFAULT_R2_PUBLIC_BASE;

// ✅ Make sure this matches your actual JSON file name/location
const jsonPath = path.join(
  process.cwd(),
  "prisma",
  "seed",
  "curriculum",
  "basic-5-computing-media.json"
);

type Row = {
  indicatorCode: string;
  image: string;  // object key
  url?: string;
  altText?: string;
  tags?: string;
};

if (!fs.existsSync(jsonPath)) {
  throw new Error(`❌ JSON not found: ${jsonPath}`);
}

const rows: Row[] = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const patched = rows.map((r) => ({
  ...r,
  url: r.url ?? `${R2_PUBLIC_BASE}/${r.image}`,
}));

fs.writeFileSync(jsonPath, JSON.stringify(patched, null, 2), "utf8");
console.log(`✅ Patched ${patched.length} rows with url -> ${jsonPath}`);
