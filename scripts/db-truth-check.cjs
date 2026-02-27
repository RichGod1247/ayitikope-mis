const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function pickTenantTable() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public' AND lower(table_name)='tenant'
    LIMIT 1;
  `);
  return rows?.[0]?.table_name ?? "Tenant";
}

async function main() {
  const table = await pickTenantTable();

  console.log("\nUsing table:", table);

  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='${table}'
    ORDER BY ordinal_position;
  `);
  console.log("\nTenant columns:");
  console.table(cols);

  const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS tenant_count FROM "${table}";`);
  console.log("\nTenant row count:");
  console.table(count);

  const sample = await prisma.$queryRawUnsafe(`
    SELECT id, name, slug,
           ${cols.some(c => c.column_name === 'schoolCode') ? '"schoolCode"' : 'NULL'} AS "schoolCode",
           ${cols.some(c => c.column_name === 'status') ? 'status' : 'NULL'} AS status,
           "createdAt"
    FROM "${table}"
    ORDER BY "createdAt" DESC
    LIMIT 5;
  `);
  console.log("\nTenant sample rows:");
  console.table(sample);

  const hasSchoolCode = cols.some(c => c.column_name === "schoolCode");
  const hasStatus = cols.some(c => c.column_name === "status");

  console.log("\nDB readiness:");
  console.log("schoolCode column:", hasSchoolCode ? "✅" : "❌");
  console.log("status column:", hasStatus ? "✅" : "❌");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
