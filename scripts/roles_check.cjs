const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const roles = await p.role.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  console.table(roles);

  const parent = await p.role.findFirst({ where: { name: { equals: "PARENT", mode: "insensitive" } }, select: { id: true, name: true } });
  console.log("PARENT:", parent || "NOT_FOUND");

  const up = await p.role.upsert({ where: { name: "PARENT" }, update: {}, create: { name: "PARENT" } });
  console.log("UPSERT:", up);
})()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await p.(); });
