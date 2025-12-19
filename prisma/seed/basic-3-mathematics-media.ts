import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

type MediaItemJson = {
  code: string;
  fileName?: string; // optional; if omitted we auto-resolve by prefix match
  figureLabel?: string;
  altText?: string;
  tags?: string[];
  pageNumberInPdf?: number;
  detailedDescription?: string;
};

type MediaJson = {
  subjectSlug: string;
  baseImageDir: string; // web path under /public, must start with "/"
  items: MediaItemJson[];
};

function ensureLeadingSlash(p: string) {
  return p.startsWith("/") ? p : `/${p}`;
}
function stripLeadingSlash(p: string) {
  return p.startsWith("/") ? p.slice(1) : p;
}

function titleCase(s: string) {
  return s
    .trim()
    .split(/\s+/g)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function deriveFigureLabelFromFile(code: string, fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, ""); // remove extension
  const stripped = base.startsWith(code + "-")
    ? base.slice((code + "-").length)
    : base === code
      ? ""
      : base;

  const cleaned = stripped.replace(/[-_]+/g, " ").trim();
  return cleaned ? titleCase(cleaned) : code;
}

async function resolveFileNameByPrefix(publicDirAbs: string, code: string) {
  const entries = await fs.readdir(publicDirAbs);
  const matches = entries
    .filter((name) => name.toLowerCase().startsWith(code.toLowerCase()))
    .filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  return matches[0] ?? null;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const CHECK = args.has("--check");
  const RESET = args.has("--reset");

  // ESM-friendly __dirname
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const jsonPath = path.join(__dirname, "curriculum", "basic-3-mathematics-media.json");
  const raw = await fs.readFile(jsonPath, "utf8");
  const mediaJson = JSON.parse(raw) as MediaJson;

  const baseImageDir = ensureLeadingSlash(mediaJson.baseImageDir.endsWith("/")
    ? mediaJson.baseImageDir
    : mediaJson.baseImageDir + "/");

  // absolute path to the folder inside /public
  const publicDirAbs = path.join(process.cwd(), "public", stripLeadingSlash(baseImageDir));

  console.log(`📦 Seeding Basic 3 Mathematics media from: ${jsonPath}`);
  console.log(`→ subjectSlug: ${mediaJson.subjectSlug}`);
  console.log(`→ items: ${mediaJson.items.length}`);

  const subject = await prisma.curriculumSubject.findUnique({
    where: { slug: mediaJson.subjectSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!subject) {
    throw new Error(
      `No curriculumSubject found for slug "${mediaJson.subjectSlug}". Seed curriculum first.`
    );
  }

  if (RESET) {
    console.log(`⚠️ --reset: deleting existing media under: ${baseImageDir} for subject: ${subject.slug}`);
    await prisma.curriculumMedia.deleteMany({
      where: {
        subjectId: subject.id,
        imagePath: { startsWith: baseImageDir },
      },
    });
  }

  // de-dupe codes (your list had B3.1.2.4.4 twice)
  const seen = new Set<string>();
  const items = mediaJson.items.filter((it) => {
    if (seen.has(it.code)) return false;
    seen.add(it.code);
    return true;
  });

  let ok = 0;
  let missing = 0;
  let created = 0;
  let updated = 0;

  const missingDetails: string[] = [];

  // ensure folder exists
  try {
    await fs.access(publicDirAbs);
  } catch {
    throw new Error(`Public folder not found: ${publicDirAbs}`);
  }

  for (const item of items) {
    // indicator must exist under this subject
    const indicator = await prisma.curriculumIndicator.findFirst({
      where: {
        code: item.code,
        contentStandard: {
          subStrand: {
            strand: { subjectId: subject.id },
          },
        },
      },
      select: { id: true, code: true, description: true },
    });

    if (!indicator) {
      missing++;
      missingDetails.push(`• ${item.code} → Indicator not found in DB for subject ${subject.slug}`);
      if (!CHECK) console.warn(`⚠️ Missing indicator in DB: ${item.code} (skipping)`);
      continue;
    }

    const fileName = item.fileName ?? (await resolveFileNameByPrefix(publicDirAbs, item.code));
    if (!fileName) {
      missing++;
      missingDetails.push(`• ${item.code} → Image file not found in /public folder: ${publicDirAbs}`);
      if (!CHECK) console.warn(`⚠️ Missing image file for: ${item.code} (skipping)`);
      continue;
    }

    const imagePath = `${baseImageDir}${fileName}`; // web path stored in DB

    ok++;

    if (CHECK) continue;

    const figureLabel =
      item.figureLabel ??
      deriveFigureLabelFromFile(item.code, fileName);

    const detailedDescription = item.detailedDescription ?? indicator.description;
    const altText = item.altText ?? `Illustration: ${indicator.description}`;
    const tags = (item.tags && item.tags.length > 0)
      ? item.tags.join(", ")
      : `Basic 3, Mathematics, ${item.code}`;

    const pageNumberInPdf = item.pageNumberInPdf ?? 0;

    const existing = await prisma.curriculumMedia.findFirst({
      where: {
        subjectId: subject.id,
        indicatorId: indicator.id,
        imagePath,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.curriculumMedia.update({
        where: { id: existing.id },
        data: {
          imagePath,
          pageNumberInPdf,
          detailedDescription,
          figureLabel,
          altText,
          tags,
        },
      });
      updated++;
      console.log(`🔁 Updated: ${item.code} -> ${imagePath}`);
    } else {
      await prisma.curriculumMedia.create({
        data: {
          imagePath,
          pageNumberInPdf,
          detailedDescription,
          figureLabel,
          altText,
          tags,
          subjectId: subject.id,
          indicatorId: indicator.id,
        },
      });
      created++;
      console.log(`✅ Created: ${item.code} -> ${imagePath}`);
    }
  }

  console.log(`✅ CHECK: subject exists: ${subject.name} (${subject.slug})`);
  console.log(`✅ CHECK: items OK (indicator+file found): ${ok}`);
  console.log(`⚠️ CHECK: items missing (indicator or file): ${missing}`);

  if (missingDetails.length) {
    console.log(`— Missing details:`);
    for (const line of missingDetails) console.log(`   ${line}`);
  }

  if (!CHECK) {
    console.log(`🎉 Done Basic 3 Mathematics media. Created: ${created}, Updated: ${updated}, Skipped: ${missing}.`);
  }
}

main()
  .catch((err) => {
    console.error("❌ Error seeding Basic 3 Mathematics media:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
