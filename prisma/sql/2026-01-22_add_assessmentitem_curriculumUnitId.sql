DO $$
DECLARE
  schema_name text := 'edulife_os';

  ai regclass;
  cu regclass;

  cu_id_type text;
BEGIN
  -- Ensure tables exist (must be quoted PascalCase)
  ai := to_regclass(format('%I."AssessmentItem"', schema_name));
  cu := to_regclass(format('%I."CurriculumUnit"', schema_name));

  IF ai IS NULL THEN
    RAISE EXCEPTION 'Missing table: %."AssessmentItem". (Check schema + exact quoting.)', schema_name;
  END IF;

  IF cu IS NULL THEN
    RAISE EXCEPTION 'Missing table: %."CurriculumUnit". (Check schema + exact quoting.)', schema_name;
  END IF;

  -- Detect CurriculumUnit.id type EXACTLY (uuid / text / varchar(n) / etc.)
  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO cu_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = schema_name
    AND c.relname = 'CurriculumUnit'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF cu_id_type IS NULL THEN
    RAISE EXCEPTION 'Could not detect type of %."CurriculumUnit"."id"', schema_name;
  END IF;

  -- Add column with SAME type as CurriculumUnit.id (so FK is valid)
  EXECUTE format(
    'ALTER TABLE %I."AssessmentItem" ADD COLUMN IF NOT EXISTS "curriculumUnitId" %s',
    schema_name,
    cu_id_type
  );

  -- IMPORTANT: do NOT schema-qualify index names (your error was the dot)
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I."AssessmentItem" ("curriculumUnitId")',
    'AssessmentItem_curriculumUnitId_idx',
    schema_name
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I."AssessmentItem" ("tenantId","curriculumUnitId")',
    'AssessmentItem_tenant_curriculumUnitId_idx',
    schema_name
  );

  -- Add FK (no IF NOT EXISTS in Postgres, so catch duplicate_object)
  BEGIN
    EXECUTE format(
      'ALTER TABLE %I."AssessmentItem"
         ADD CONSTRAINT %I
         FOREIGN KEY ("curriculumUnitId")
         REFERENCES %I."CurriculumUnit"("id")
         ON DELETE SET NULL
         ON UPDATE CASCADE',
      schema_name,
      'AssessmentItem_curriculumUnitId_fkey',
      schema_name
    );
  EXCEPTION
    WHEN duplicate_object THEN
      -- already exists, ignore
      NULL;
  END;
END $$;
