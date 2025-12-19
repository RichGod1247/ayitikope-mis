// prisma/seed/debug-list-curriculum-subjects.ts
//
// Helper script to list all CurriculumSubject rows,
// so we can see the actual slugs and names stored in
// the database.
//
// Run with:
//   npx ts-node prisma/seed/debug-list-curriculum-subjects.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Listing all CurriculumSubject records…\n");

  const subjects = await prisma.curriculumSubject.findMany({
    orderBy: {
      name: "asc",
    },
  });

  console.log(`📊 Total CurriculumSubject rows: ${subjects.length}\n`);

  for (const s of subjects) {
    console.log(
      `- id=${s.id}, name="${s.name}", slug="${s.slug}"`
    );
  }

  console.log(
    "\n🧾 Look through this list and identify which entry corresponds to KG1 Our World and Our People.\n" +
      "   Copy its exact slug value; we will use that slug in our media JSON and debug scripts."
  );
}

main()
  .catch((err) => {
    console.error("❌ Error in debug-list-curriculum-subjects:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
