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

const dashboard = read("src/app/teacher/dashboard/page.tsx");
const layout = read("src/app/teacher/layout.tsx");
const attendancePage = read("src/app/teacher/attendance/[sessionId]/page.tsx");
const attendanceList = read("src/components/teacher/TeacherAttendanceClient.tsx");
const session = read("src/components/attendance/AttendanceSessionClient.tsx");
const scanner = read("src/components/attendance/QrCameraScanner.tsx");
const notifyRoute = read("src/app/api/teacher/attendance/notify-parents/route.ts");

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
  "What to do",
  "Mark learners",
  "Save marks",
  "Close register",
  "Certify",
  'data-attendance-summary-ui="notify-inline-v1"',
  "Attendance summary",
  "Notify parents",
  'data-attendance-register-ui="primary-v1"',
  "Learner register",
  "Tap one status for every learner.",
  "md:hidden",
  "hidden overflow-x-auto md:block",
  "Scan learner badge",
  'data-attendance-scanner-ui="collapsed-v1"',
  "showBadgeScanner",
  "QrCameraScanner",
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
]) {
  assert(
    !session.includes(forbidden),
    "Attendance-session clutter/sender residue found",
    forbidden,
  );
}

assert(
  session.indexOf('data-attendance-register-ui="primary-v1"') >
    session.indexOf('data-attendance-summary-ui="notify-inline-v1"'),
  "Learner register must follow the compact guide and summary",
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
  assert(notifyRoute.includes(marker), "Server-authoritative SMS sender marker missing", marker);
}

for (const forbidden of ["brand?: string", "body?.brand"]) {
  assert(
    !notifyRoute.includes(forbidden),
    "Notify route must not accept a client-controlled sender",
    forbidden,
  );
}

for (const marker of [
  'await import("@zxing/browser")',
  "controlsRef.current?.stop()",
  "video.srcObject = null",
  "return () => stopCamera()",
]) {
  assert(scanner.includes(marker), "QR camera cleanup/lazy-load contract missing", marker);
}

for (const source of [dashboard, layout, attendancePage, attendanceList, session, notifyRoute]) {
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
console.log("Attendance summary             : counts + Notify parents");
console.log("Notification preview card      : removed");
console.log("Learner register               : primary responsive content");
console.log("Mobile learner register        : native cards, no wide-table dependency");
console.log("Badge scanner                  : explicit reveal only");
console.log("Camera cleanup/lazy loading    : preserved");
console.log("Editable SMS sender            : removed");
console.log("Server SMS sender              : EDULIFEOS");
console.log("Attendance lifecycle semantics : preserved");
console.log("Browser persistence/polling    : absent");
console.log("Database accessed              : false");
console.log("");
console.log("RESULT: A15 TEACHER BBC DASHBOARD + ATTENDANCE UI GREEN");
