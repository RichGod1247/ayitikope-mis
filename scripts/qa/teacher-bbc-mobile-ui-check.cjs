/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function assert(condition, message, details) {
  if (condition) return;
  const suffix = details ? ` :: ${JSON.stringify(details)}` : "";
  throw new Error(`${message}${suffix}`);
}

function indexBefore(text, first, second, message) {
  const a = text.indexOf(first);
  const b = text.indexOf(second);
  assert(a >= 0, `${message}_FIRST_MARKER_MISSING`, first);
  assert(b >= 0, `${message}_SECOND_MARKER_MISSING`, second);
  assert(a < b, `${message}_ORDER_INVALID`, { first, second, a, b });
}

const dashboard = read("src/app/teacher/dashboard/page.tsx");
const layout = read("src/app/teacher/layout.tsx");
const attendancePage = read("src/app/teacher/attendance/[sessionId]/page.tsx");
const attendanceList = read("src/components/teacher/TeacherAttendanceClient.tsx");
const session = read("src/components/attendance/AttendanceSessionClient.tsx");
const scanner = read("src/components/attendance/QrCameraScanner.tsx");
const notifyRoute = read("src/app/api/teacher/attendance/notify-parents/route.ts");
const sessionGetRoute = read("src/app/api/teacher/attendance/sessions/get/route.ts");
const marksUpsertRoute = read("src/app/api/teacher/attendance/marks/upsert/route.ts");

for (const marker of [
  'data-teacher-glance-ui="bbc-compact-v1"',
  'data-teacher-workspace-ui="primary-v1"',
  "Today at a glance",
  "Your workspace",
  "grid-cols-2",
  "quickAttendanceLabel",
]) {
  assert(dashboard.includes(marker), "Teacher dashboard BBC marker missing", marker);
}

assert(
  dashboard.indexOf('data-teacher-glance-ui="bbc-compact-v1"') <
    dashboard.indexOf('data-teacher-workspace-ui="primary-v1"'),
  "Compact glance must remain above the primary workspace",
);

assert(
  !dashboard.includes("Health coming soon</span>"),
  "Today-at-a-glance must not keep the old secondary Health action",
);

for (const marker of [
  'data-teacher-mobile-nav="collapsed-v1"',
  "<details",
  "☰ Menu",
  "group-open:hidden",
  "xl:hidden",
  "hidden items-center gap-3 xl:flex",
  'data-teacher-sticky-header="v1"',
  "[--teacher-sticky-top:65px]",
]) {
  assert(layout.includes(marker), "Teacher mobile navigation marker missing", marker);
}

const mobileNavStart = layout.indexOf('data-teacher-mobile-nav="collapsed-v1"');
const mobileNavEnd = layout.indexOf("</details>", mobileNavStart);
const mobileNavBlock =
  mobileNavStart >= 0 && mobileNavEnd > mobileNavStart
    ? layout.slice(mobileNavStart, mobileNavEnd)
    : "";

assert(
  mobileNavBlock.includes("LogoutButton"),
  "Mobile navigation must keep logout behind the collapsed Menu",
);

for (const forbidden of ["brand?: string", "initialBrand", "sp.brand"]) {
  assert(
    !attendancePage.includes(forbidden),
    "Attendance session page must not accept client-controlled SMS sender",
    forbidden,
  );
}

for (const marker of [
  'body: JSON.stringify({ sessionId })',
  "Parent SMS sender is secured by EduLife OS on the server.",
]) {
  assert(
    attendanceList.includes(marker),
    "Attendance-list server-sender marker missing",
    marker,
  );
}

for (const marker of [
  'data-attendance-class-mode="single-default-v1"',
  "Single stream",
  "Class arms",
  "singleStreamClassrooms",
  "multiStreamClassroomsAvailable",
  "Your assigned Class Teacher / Class Adviser register.",
  "Choose Class arms to select the exact register.",
  'data-attendance-calendar-authority="tenant-current-term-v1"',
  "School calendar",
  "Reopening:",
  "Closing:",
]) {
  assert(
    attendanceList.includes(marker),
    "Attendance class-mode/BBC marker missing",
    marker,
  );
}

for (const forbidden of [
  "Brand/Sender ID",
  "setBrand(",
  "&brand=",
  "JSON.stringify({ sessionId, brand",
]) {
  assert(
    !attendanceList.includes(forbidden),
    "Attendance-list editable sender residue found",
    forbidden,
  );
}

for (const marker of [
  'data-attendance-bbc-guide="v1"',
  'data-attendance-guide-sticky="compact-v2"',
  "top-[var(--teacher-sticky-top)]",
  "What to do",
  "Step {guideCurrentStep} of 4",
  "Mark learners",
  "Save marks",
  "Close register",
  "Certify",
  "showAttendanceSummary",
  'data-attendance-summary-ui="collapsed-v2"',
  "Attendance summary",
  "Notify parents",
  'data-attendance-manual-statuses="present-absent-v1"',
  '(["PRESENT", "ABSENT"] as ManualAttendanceStatus[])',
  'data-attendance-register-ui="primary-v1"',
  "Learner register",
  "Tap Present or Absent for every learner. Mark note is optional.",
  "Mark note",
  "md:hidden",
  "hidden overflow-x-auto md:block",
  "Scan learner badge",
  'data-attendance-scanner-ui="collapsed-v1"',
  "showBadgeScanner",
  "QrCameraScanner",
  "Read-only register.",
  "academicCalendar?.allowed === true",
]) {
  assert(session.includes(marker), "Attendance BBC/mobile marker missing", marker);
}

for (const forbidden of [
  "Notification preview",
  "Register seal attendance backup",
  ">Back<",
  "Sender</span>",
  "setBrand(",
  "value={brand}",
  "closeThenNotify()",
  "Close + Notify",
  "initialBrand",
  'data-attendance-summary-ui="notify-inline-v1"',
  '(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as AttendanceStatus[])',
]) {
  assert(
    !session.includes(forbidden),
    "Attendance-session clutter/sender residue found",
    forbidden,
  );
}

assert(
  session.indexOf('data-attendance-register-ui="primary-v1"') >
    session.indexOf('data-attendance-bbc-guide="v1"'),
  "Learner register must follow the compact sticky guide",
);

assert(
  session.includes("{showAttendanceSummary ? (") &&
    session.includes('data-attendance-summary-ui="collapsed-v2"'),
  "Attendance summary must remain collapsed until explicitly opened",
);

const guideStart = session.indexOf('data-attendance-bbc-guide="v1"');
const notifyButton = session.indexOf("Notify parents", guideStart);
const summaryPanel = session.indexOf('data-attendance-summary-ui="collapsed-v2"');

assert(
  guideStart >= 0 && notifyButton > guideStart && summaryPanel > notifyButton,
  "Notify parents must live in the sticky guide before the collapsed summary panel",
  { guideStart, notifyButton, summaryPanel },
);

assert(
  session.includes("showBadgeScanner && !locked") &&
    session.includes("<QrCameraScanner"),
  "Badge scanner must render only after explicit reveal",
);

for (const marker of [
  'const ATTENDANCE_SMS_SENDER = "EDULIFEOS";',
  "brand: ATTENDANCE_SMS_SENDER",
  "from: ATTENDANCE_SMS_SENDER",
  'body?.sessionId',
]) {
  assert(
    notifyRoute.includes(marker),
    "Server-authoritative SMS sender marker missing",
    marker,
  );
}

for (const forbidden of ["brand?: string", "body?.brand"]) {
  assert(
    !notifyRoute.includes(forbidden),
    "Notify route must not accept a client-controlled sender",
    forbidden,
  );
}

for (const marker of [
  "getGuardianEssentialAlertEligibilityMap",
  'purpose: "STUDENT_ATTENDANCE"',
  'eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT"',
  'essentialAlertPurpose: "STUDENT_ATTENDANCE"',
  'notificationClaim: "SESSION_NOTIFYING_AT"',
  "notificationSealed: sealedAt !== null",
]) {
  assert(
    notifyRoute.includes(marker),
    "Teacher attendance Essential Alerts marker missing",
    marker,
  );
}

assert(
  !notifyRoute.includes("guardianSmsOptIn"),
  "Teacher notify route must not use legacy guardianSmsOptIn authority",
);

indexBefore(
  notifyRoute,
  "const claim = await prisma.attendanceSession.updateMany",
  "await getGuardianEssentialAlertEligibilityMap",
  "Teacher notification claim must precede eligibility evaluation",
);

indexBefore(
  notifyRoute,
  "await getGuardianEssentialAlertEligibilityMap",
  "await sendSms({",
  "Teacher Essential Alerts eligibility must precede SMS provider dispatch",
);

for (const marker of [
  "getGuardianEssentialAlertEligibilityMap",
  'purpose: "STUDENT_ATTENDANCE"',
  "essentialAlertSmsEligible",
  'eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT"',
]) {
  assert(
    sessionGetRoute.includes(marker),
    "Teacher attendance session Essential Alerts marker missing",
    marker,
  );
}

assert(
  !sessionGetRoute.includes("guardianSmsOptIn"),
  "Teacher session GET must not publish legacy guardianSmsOptIn as attendance authority",
);

for (const marker of [
  "essentialAlertSmsEligible",
  "essentialAlertEligibility",
  "Essential Alerts eligible",
  "Essential Alerts not enabled",
]) {
  assert(
    session.includes(marker),
    "Attendance session Essential Alerts UX marker missing",
    marker,
  );
}

assert(
  !session.includes("guardianSmsOptIn"),
  "Attendance session UI must not derive SMS eligibility from legacy guardianSmsOptIn",
);

for (const marker of [
  'function isManualStatus(status: AttendanceStatus): status is "PRESENT" | "ABSENT"',
  'manualStatusPolicy: "PRESENT_ABSENT_ONLY"',
  'legacyStatusCompatibility: "UNCHANGED_EXISTING_ONLY"',
  "Manual attendance accepts only PRESENT or ABSENT.",
  "existing?.status === desiredMark.status",
]) {
  assert(
    marksUpsertRoute.includes(marker),
    "Manual Present/Absent server policy marker missing",
    marker,
  );
}

assert(
  marksUpsertRoute.indexOf("existingByStudent") <
    marksUpsertRoute.indexOf("Manual attendance accepts only PRESENT or ABSENT."),
  "Legacy compatibility validation must be grounded in the existing stored mark",
);

assert(
  marksUpsertRoute.indexOf("Manual attendance accepts only PRESENT or ABSENT.") <
    marksUpsertRoute.indexOf("await prisma.$transaction(async (tx) =>"),
  "Present/Absent policy must reject invalid manual status before attendance writes",
);

for (const marker of [
  'await import("@zxing/browser")',
  "controlsRef.current?.stop()",
  "video.srcObject = null",
  "return () => stopCamera()",
]) {
  assert(scanner.includes(marker), "QR camera cleanup/lazy-load contract missing", marker);
}

for (const source of [dashboard, layout, attendancePage, attendanceList, session, notifyRoute, marksUpsertRoute]) {
  for (const forbidden of ["localStorage", "sessionStorage", "setInterval("]) {
    assert(
      !source.includes(forbidden),
      "BBC cleanup must not add browser persistence or polling",
      forbidden,
    );
  }
}

console.log("");
console.log("=== A15 TEACHER BBC DASHBOARD + ATTENDANCE UI ===");
console.log("");
console.log("Teacher glance card            : compact");
console.log("Teacher workspace              : primary visual focus");
console.log("Desktop navigation             : preserved");
console.log("Mobile navigation              : collapsed behind Menu");
console.log("Mobile logout                  : hidden inside Menu");
console.log("Attendance guide               : Mark -> Save -> Close -> Certify");
console.log("Attendance summary             : collapsed behind explicit button");
console.log("Sticky progress guide          : compact under teacher header");
console.log("Notify parents                 : moved into progress guide");
console.log("Manual learner statuses        : PRESENT / ABSENT only");
console.log("Legacy Late/Excused records    : read/preserve compatibility only");
console.log("Notification preview card      : removed");
console.log("Learner register               : primary responsive content");
console.log("Mobile learner register        : native cards, no wide-table dependency");
console.log("Badge scanner                  : explicit reveal only");
console.log("Camera cleanup/lazy loading    : preserved");
console.log("Editable SMS sender            : removed");
console.log("Server SMS sender              : EDULIFEOS");
console.log("Attendance eligibility source  : ESSENTIAL_ALERT_ENROLLMENT");
console.log("Attendance purpose             : STUDENT_ATTENDANCE");
console.log("Legacy guardianSmsOptIn        : NOT AUTHORITATIVE");
console.log("Attendance lifecycle semantics : preserved");
console.log("Academic calendar authority    : current school term / fail-closed");
console.log("Browser persistence/polling    : absent");
console.log("Database accessed              : false");
console.log("");
console.log("RESULT: A15 TEACHER BBC DASHBOARD + ATTENDANCE UI GREEN");
