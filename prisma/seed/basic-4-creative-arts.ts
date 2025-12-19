import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ✅ Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔁 Auto-discover all Basic 4 Creative Arts part JSON files
const CURRICULUM_DIR = path.join(__dirname, "curriculum");

const partFiles = fs
  .readdirSync(CURRICULUM_DIR)
  .filter(
    (name) =>
      name.toLowerCase().includes("basic-4-creative-arts-part") &&
      name.toLowerCase().endsWith(".json")
  );

console.log(
  "📦 Seeding Basic 4 Creative Arts from JSON parts in:",
  CURRICULUM_DIR
);
console.log("🔍 Found Basic 4 Creative Arts part files:", partFiles);

async function main() {
  if (partFiles.length === 0) {
    console.error("❌ No Basic 4 Creative Arts part JSON files found.");
    process.exit(1);
  }

  let allSubjects: any[] = [];

  for (const partFile of partFiles) {
    const partPath = path.join(CURRICULUM_DIR, partFile);

    if (!fs.existsSync(partPath)) {
      console.log(`ℹ️ Part file not found yet, skipping: ${partFile}`);
      continue;
    }

    console.log(`📖 Loading Basic 4 Creative Arts from: ${partPath}`);
    const raw = fs.readFileSync(partPath, "utf8");
    const json = JSON.parse(raw);

    // ⚠️ Some parts use { part, subjects: [...] }, others are a single subject at root
    if (Array.isArray(json.subjects)) {
      allSubjects = allSubjects.concat(json.subjects);
    } else {
      allSubjects.push(json);
    }
  }

  if (allSubjects.length === 0) {
    console.error(
      "❌ No Basic 4 Creative Arts subject data found in any part files."
    );
    process.exit(1);
  }

  console.log(
    `✅ Loaded ${allSubjects.length} subject(s) for Basic 4 Creative Arts`
  );

  // ⬇️ Plug into your common curriculum seeding logic here, e.g.:
  // for (const subject of allSubjects) {
  //   await upsertCurriculumSubject(prisma, subject);
  // }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
