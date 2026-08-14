BEGIN;

SET LOCAL search_path TO "edulife_os", pg_catalog;

CREATE TABLE "platform_feature_flag" (
  "key" VARCHAR(80) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_by_user_id" TEXT,
  "reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_feature_flag_pkey" PRIMARY KEY ("key")
);

INSERT INTO "platform_feature_flag" (
  "key",
  "enabled",
  "reason"
) VALUES (
  'TEACHER_ATTENDANCE',
  false,
  'Disabled by default pending institutional safeguards for fair use.'
);

COMMIT;
