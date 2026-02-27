CREATE INDEX IF NOT EXISTS "AssessmentItem_filters_idx"
ON edulife_os."AssessmentItem" ("tenantId", "classroomId", "term", "academicYear");
