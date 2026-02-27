[dotenv@17.2.3] injecting env (3) from prisma\.env -- tip: ≡ƒæÑ sync secrets across teammates & machines: https://dotenvx.com/ops
-- DropForeignKey
ALTER TABLE "TeacherProfile" DROP CONSTRAINT "TeacherProfile_primaryClassroomId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_lastActiveTenant_fkey";

-- DropForeignKey
ALTER TABLE "tenant_settings" DROP CONSTRAINT "tenant_settings_tenant_fk";

-- DropForeignKey
ALTER TABLE "tenant_settings" DROP CONSTRAINT "tenant_settings_tenant_fkey";

-- DropForeignKey
ALTER TABLE "tenant_settings" DROP CONSTRAINT "tenant_settings_tenantid_fkey";

-- DropIndex
DROP INDEX "AssessmentItem_filters_idx";

-- DropIndex
DROP INDEX "Role_name_unique";

-- DropIndex
DROP INDEX "SchemeOfWork_subject_term_year_idx";

-- DropIndex
DROP INDEX "SchemeOfWork_tenant_teacher_idx";

-- DropIndex
DROP INDEX "tenant_settings_updatedAt_idx";

-- AlterTable
ALTER TABLE "SchemeOfWork" DROP COLUMN "phase",
ALTER COLUMN "level" SET NOT NULL,
ALTER COLUMN "submittedAt" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "SchemeOfWorkItem" DROP COLUMN "curriculumIndicatorId",
DROP COLUMN "level",
DROP COLUMN "phase",
DROP COLUMN "strandCode",
DROP COLUMN "subStrandCode",
DROP COLUMN "subject";

-- AlterTable
ALTER TABLE "tenant_settings" DROP COLUMN "attendance_end_time",
DROP COLUMN "attendance_start_time",
DROP COLUMN "fever_threshold",
DROP COLUMN "late_cutoff_minutes",
DROP COLUMN "term1_end",
DROP COLUMN "term1_start",
DROP COLUMN "term2_end",
DROP COLUMN "term2_start",
DROP COLUMN "term3_end",
DROP COLUMN "term3_start",
ADD COLUMN     "attendanceEndTime" TEXT,
ADD COLUMN     "attendanceStartTime" TEXT,
ADD COLUMN     "feverThreshold" DECIMAL(4,1),
ADD COLUMN     "lateCutoffMinutes" INTEGER,
ADD COLUMN     "term1End" DATE,
ADD COLUMN     "term1Start" DATE,
ADD COLUMN     "term2End" DATE,
ADD COLUMN     "term2Start" DATE,
ADD COLUMN     "term3End" DATE,
ADD COLUMN     "term3Start" DATE;

-- CreateTable
CREATE TABLE "FeesInvoice" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT,
    "studentName" TEXT NOT NULL,
    "guardianPhone" TEXT NOT NULL,
    "className" TEXT,
    "term" TEXT,
    "amountDue" DECIMAL(10,2) NOT NULL,
    "dueDate" DATE,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "lastReminderAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Classroom_tenantId_idx" ON "Classroom"("tenantId");

-- CreateIndex
CREATE INDEX "Classroom_tenantId_grade_idx" ON "Classroom"("tenantId", "grade");

-- CreateIndex
CREATE INDEX "Classroom_tenantId_name_idx" ON "Classroom"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Membership_tenantId_status_idx" ON "Membership"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_staffIdNorm_key" ON "Membership"("tenantId", "staffIdNorm");

-- CreateIndex
CREATE INDEX "scheme_tenant_teacher_term_year_idx" ON "SchemeOfWork"("tenantId", "teacherUserId", "term", "academicYear");

-- CreateIndex
CREATE INDEX "scheme_tenant_status_idx" ON "SchemeOfWork"("tenantId", "status");

-- CreateIndex
CREATE INDEX "scheme_tenant_subject_level_idx" ON "SchemeOfWork"("tenantId", "subject", "level");

-- CreateIndex
CREATE UNIQUE INDEX "scheme_unique_teacher_subject_level_term_year" ON "SchemeOfWork"("tenantId", "teacherUserId", "subject", "level", "term", "academicYear");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_lastActiveTenantId_fkey" FOREIGN KEY ("lastActiveTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SchemeOfWork" ADD CONSTRAINT "SchemeOfWork_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemeOfWork" ADD CONSTRAINT "SchemeOfWork_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemeOfWork" ADD CONSTRAINT "SchemeOfWork_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemeOfWork" ADD CONSTRAINT "SchemeOfWork_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_primaryClassroomId_fkey" FOREIGN KEY ("primaryClassroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Classroom_tenant_name_arm_unique" RENAME TO "Classroom_tenantId_name_arm_key";

-- RenameIndex
ALTER INDEX "FeeInvoice_unique_tenant_student_term_year" RENAME TO "FeeInvoice_tenantId_studentId_term_academicYear_key";

-- RenameIndex
ALTER INDEX "Student_tenant_guardianPhoneNorm_idx" RENAME TO "Student_tenantId_guardianPhoneNorm_idx";

-- RenameIndex
ALTER INDEX "teacherProfile_tenant_user_unique" RENAME TO "TeacherProfile_tenantId_userId_key";

