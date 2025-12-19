// prisma/seed/debug-media-count.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("DATABASE_URL at runtime:", process.env.DATABASE_URL);

  const totalMedia = await prisma.curriculumMedia.count();
  console.log("Total CurriculumMedia rows:", totalMedia);

  const totalSubjects = await prisma.curriculumSubject.count();
  console.log("Total CurriculumSubject rows:", totalSubjects);

  const mediaForB3English = await prisma.curriculumMedia.count({
    where: {
      subject: {
        slug: "basic-3-english-language",
      },
    },
  });
  console.log(
    "CurriculumMedia rows for basic-3-english-language:",
    mediaForB3English
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
