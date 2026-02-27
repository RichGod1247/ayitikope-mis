import { prisma } from "../../src/lib/prisma";
import crypto from "crypto";

function makeCode() {
  // SCH- + 6 hex chars = short but decent uniqueness
  return "SCH-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { schoolCode: null },
    select: { id: true },
  });

  for (const t of tenants) {
    let code = makeCode();

    // ensure unique
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await prisma.tenant.findFirst({
        where: { schoolCode: code },
        select: { id: true },
      });
      if (!exists) break;
      code = makeCode();
    }

    await prisma.tenant.update({
      where: { id: t.id },
      data: { schoolCode: code },
    });

    console.log("Backfilled tenant", t.id, "=>", code);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
