// scripts/which-schema.cjs
const { PrismaClient } = require("@prisma/client");

(async () => {
  const prisma = new PrismaClient();
  try {
    const meta = await prisma.$queryRawUnsafe(`
      select
        current_schema() as current_schema,
        current_setting('search_path') as search_path
    `);
    console.table(meta);

    const tenantCols = await prisma.$queryRawUnsafe(`
      select table_schema, column_name, data_type, is_nullable
      from information_schema.columns
      where table_name = 'Tenant'
        and table_schema in ('public', 'edulife_os')
      order by table_schema, ordinal_position
    `);
    console.table(tenantCols);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
