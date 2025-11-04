const { PrismaClient } = require("@prisma/client");
(async () => {
  try {
    const prisma = new PrismaClient({ log: ["error"] });
    const r = await prisma.$queryRawUnsafe("select 1");
    console.log("DB OK:", r);
    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error("DB FAIL");
    console.error(e);
    process.exit(1);
  }
})();
