import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to curriculum JSON
const CURRICULUM_DIR = path.join(__dirname, "curriculum");
const FILE_NAME = "basic-1-religious-and-moral-education.json";

console.log("📦 Seeding Basic 1 Religious and Moral Education from JSON in:", CURRICULUM_DIR);

async function main() {
  const fullPath = path.join(CURRICULUM_DIR, FILE_NAME);

  if (!fs.existsSync(fullPath)) {
    console.error("❌ Basic 1 R.M.E JSON file not found:", fullPath);
    process.exit(1);
  }

  console.log("📖 Loading Basic 1 R.M.E from:", fullPath);

  const raw = fs.readFileSync(fullPath, "utf8");
  const json = JSON.parse(raw);

  // Our JSON root *is the subject itself*, not { subjects: [...] }
  const subjects: any[] = [json];

  if (!subjects.length) {
    console.error("❌ No Basic 1 R.M.E subject data found in JSON.");
    process.exit(1);
  }

  console.log(`✅ Loaded ${subjects.length} subject(s) for Basic 1 R.M.E`);

  // ⬇️ Plug into your existing curriculum seeding logic here, using `subjects`
  // e.g.
  // for (const subject of subjects) {
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
