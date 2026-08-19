-- N7 Staff Feedback independent review spine.
-- This table is intentionally separate from appraisal_review because
-- appraisal_review is assessment-bound (assessmentId required) and therefore
-- belongs to the governance supervisory evidence stream.

CREATE TABLE "edulife_os"."appraisal_staff_feedback_review" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cycleId" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "reviewerAssignmentId" TEXT,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "decision" "edulife_os"."AppraisalReviewDecision" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedAt" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appraisal_staff_feedback_review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AppraisalStaffFeedbackReview_stage_check"
      CHECK ("stage" >= 1),
    CONSTRAINT "AppraisalStaffFeedbackReview_decision_shape_check"
      CHECK (
        ("decision" = 'PENDING' AND "decidedAt" IS NULL AND "note" IS NULL)
        OR
        ("decision" IN ('RETURNED', 'HELD') AND "decidedAt" IS NOT NULL AND length(btrim(COALESCE("note", ''))) >= 3)
        OR
        ("decision" = 'ACCEPTED' AND "decidedAt" IS NOT NULL)
      )
);

CREATE UNIQUE INDEX "AppraisalStaffFeedbackReview_cycle_stage_unique"
  ON "edulife_os"."appraisal_staff_feedback_review"("cycleId", "stage");

CREATE INDEX "AppraisalStaffFeedbackReview_cycle_decision_idx"
  ON "edulife_os"."appraisal_staff_feedback_review"("cycleId", "decision");

CREATE INDEX "AppraisalStaffFeedbackReview_snapshot_idx"
  ON "edulife_os"."appraisal_staff_feedback_review"("snapshotId");

CREATE INDEX "AppraisalStaffFeedbackReview_reviewer_decision_idx"
  ON "edulife_os"."appraisal_staff_feedback_review"("reviewerUserId", "decision");

CREATE INDEX "AppraisalStaffFeedbackReview_assignment_idx"
  ON "edulife_os"."appraisal_staff_feedback_review"("reviewerAssignmentId");

CREATE INDEX "AppraisalStaffFeedbackReview_decidedAt_idx"
  ON "edulife_os"."appraisal_staff_feedback_review"("decidedAt");

ALTER TABLE "edulife_os"."appraisal_staff_feedback_review"
  ADD CONSTRAINT "AppraisalStaffFeedbackReview_cycle_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "edulife_os"."appraisal_cycle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "edulife_os"."appraisal_staff_feedback_review"
  ADD CONSTRAINT "AppraisalStaffFeedbackReview_snapshot_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "edulife_os"."appraisal_aggregate_snapshot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "edulife_os"."appraisal_staff_feedback_review"
  ADD CONSTRAINT "AppraisalStaffFeedbackReview_reviewer_fkey"
  FOREIGN KEY ("reviewerUserId") REFERENCES "edulife_os"."User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "edulife_os"."appraisal_staff_feedback_review"
  ADD CONSTRAINT "AppraisalStaffFeedbackReview_assignment_fkey"
  FOREIGN KEY ("reviewerAssignmentId") REFERENCES "edulife_os"."GovernanceOfficerAssignment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
