import { PrismaClient } from "@prisma/client";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), "prisma", ".env") });

const prisma = new PrismaClient();

async function main() {
  const subjectSlug = "basic-2-our-world-and-our-people";

  const strandCode = "B2.4";
  const subStrandCode = "B2.4.2";
  const contentStandardCode = "B2.4.2.1";

  const missingIndicatorCode = "B2.4.2.1.2";
  const missingIndicatorDescription =
    "Identify people in authority in the school and community"; // adjust later if needed

  console.log("🔎 Locating content standard:", contentStandardCode);

  const cs = await prisma.curriculumContentStandard.findFirst({
    where: {
      code: contentStandardCode,
      subStrand: {
        code: subStrandCode,
        strand: {
          code: strandCode,
          subject: { slug: subjectSlug },
        },
      },
    },
    select: { id: true },
  });

  if (!cs) {
    console.log("❌ Content standard not found in DB.");
    console.log(
      "👉 This means your Basic 2 OWOP curriculum seed did not create B2.4.2.1. Re-run the curriculum seed for Basic 2 OWOP first."
    );
    process.exit(1);
  }

  const existing = await prisma.curriculumIndicator.findFirst({
    where: {
      code: missingIndicatorCode,
      contentStandardId: cs.id,
    },
    select: { id: true },
  });

  if (existing) {
    console.log(`✅ Indicator already exists: ${missingIndicatorCode} (id=${existing.id})`);
    return;
  }

  const created = await prisma.curriculumIndicator.create({
    data: {
      code: missingIndicatorCode,
      description: missingIndicatorDescription,
      orderIndex: 2,
      contentStandard: { connect: { id: cs.id } },
    },
    select: { id: true },
  });

  console.log(`🎉 Created missing indicator ${missingIndicatorCode} (id=${created.id})`);
}

main()
  .catch((e) => {
    console.error("❌ Patch failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
