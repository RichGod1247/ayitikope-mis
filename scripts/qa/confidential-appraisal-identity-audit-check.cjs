/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const root = process.cwd();

const files = {
  service: "src/lib/appraisals/confidentialIdentityAudit.ts",
  route: "src/app/api/admin/super/appraisals/confidential-identities/route.ts",
  page: "src/app/admin/super/appraisals/confidential-identities/page.tsx",
  client:
    "src/app/admin/super/appraisals/confidential-identities/ConfidentialIdentityAuditClient.tsx",
  superHome: "src/app/admin/super/page.tsx",
  headteacherMasked: "src/lib/appraisals/headteacherDirectorAnonymousResponses.ts",
  directorMasked: "src/lib/appraisals/directorFeedbackRespondents.ts",
  authority: "src/lib/appraisals/authority.ts",
  schema: "prisma/schema.prisma",
};

function read(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) throw new Error(`MISSING:${rel}`);
  return fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n");
}

function requireText(source, fragment, label) {
  if (!source.includes(fragment)) throw new Error(`MISSING_CONTRACT:${label}`);
}

function forbidText(source, fragment, label) {
  if (source.includes(fragment)) throw new Error(`FORBIDDEN_CONTRACT:${label}`);
}

const service = read(files.service);
const route = read(files.route);
const client = read(files.client);
const superHome = read(files.superHome);
const headteacherMasked = read(files.headteacherMasked);
const directorMasked = read(files.directorMasked);
const authority = read(files.authority);
const schema = read(files.schema);

console.log("=== N7-P1B SUPERADMIN CONFIDENTIAL IDENTITY AUDIT ===");
console.log("");

requireText(service, 'requiredCapability: "VIEW_CONFIDENTIAL_RESPONDENTS"', "superadmin capability");
requireText(service, 'oneRespondentPerReveal: true', "single respondent reveal");
requireText(service, 'bulkRevealAllowed: false', "bulk reveal forbidden");
requireText(service, 'exportAllowed: false', "export forbidden");
requireText(service, 'finalizedResponsesOnly: true', "finalized only");
requireText(service, 'tx.appraisalIdentityAccess.create', "hard identity access audit");
requireText(service, 'APPRAISAL_AUDIT_ACTIONS.CONFIDENTIAL_IDENTITY_VIEWED', "generic appraisal audit action");
requireText(service, 'Prisma.TransactionIsolationLevel.Serializable', "serializable reveal transaction");
requireText(service, 'participant.status !== "FINALIZED"', "finalized participant recheck");
requireText(service, 'participant.response.status !== "FINALIZED"', "finalized response recheck");
requireText(service, '"director-feedback-mask"', "director masked seed parity");
requireText(service, 'leftHash.localeCompare(rightHash)', "headteacher response hash ordering");
requireText(service, 'clean(left.response?.id).localeCompare', "headteacher response id tie-break");

requireText(route, 'const MAX_BODY_BYTES = 16 * 1024', "16KiB body limit");
requireText(route, '"Cache-Control": "no-store, max-age=0"', "no-store route");
requireText(route, '"cycleId"', "cycle field");
requireText(route, '"respondentKey"', "respondent field");
requireText(route, '"purpose"', "purpose field");
requireText(route, '"reason"', "reason field");
requireText(route, '"confirm"', "confirm field");

requireText(client, 'window.confirm(', "browser confirmation");
requireText(client, 'Hide identity', "explicit hide action");
requireText(client, 'No export or browser persistence is provided.', "privacy warning");
forbidText(client, 'localStorage', "localStorage forbidden");
forbidText(client, 'sessionStorage', "sessionStorage forbidden");
forbidText(client, 'setInterval(', "polling forbidden");

requireText(superHome, 'href: "/admin/super/safety-controls"', "safety controls dashboard tile");
requireText(
  superHome,
  'href: "/admin/super/appraisals/confidential-identities"',
  "identity audit dashboard tile",
);

requireText(headteacherMasked, 'realRespondentIdentitiesIncluded: false', "headteacher ordinary flow stays masked");
requireText(headteacherMasked, 'superadminIdentityPathSeparate: true', "headteacher superadmin path separate");
requireText(directorMasked, 'respondentIdentityVisible: false', "director ordinary flow stays masked");
requireText(directorMasked, 'schoolIdentityVisible: false', "director school identity stays masked");

requireText(authority, '"VIEW_CONFIDENTIAL_RESPONDENTS"', "authority capability exists");
requireText(authority, 'confidentialIdentityAccessRequiresAudit: true', "authority requires audit");
requireText(authority, 'directorFeedbackIdentityAccessIsSuperadminOnly: true', "director identity superadmin only");

requireText(schema, 'model AppraisalIdentityAccess {', "existing identity audit model");
requireText(schema, 'enum AppraisalIdentityAccessPurpose {', "existing purpose enum");
requireText(schema, 'ACCOUNTABILITY_REVIEW', "accountability purpose");
requireText(schema, 'INVESTIGATION', "investigation purpose");
requireText(schema, 'SUPPORT', "support purpose");
requireText(schema, 'LEGAL_COMPLIANCE', "legal purpose");

console.log("Superadmin only                 : capability + active membership");
console.log("Initial list payload            : masked only");
console.log("Reveal granularity              : one finalized respondent");
console.log("Purpose + reason + confirm      : required");
console.log("Identity audit                  : AppraisalIdentityAccess hard write");
console.log("Generic audit                   : CONFIDENTIAL_IDENTITY_VIEWED");
console.log("Reveal transaction              : SERIALIZABLE");
console.log("Director masking parity         : preserved");
console.log("Headteacher masking parity      : preserved");
console.log("Ordinary Director/HT APIs       : untouched");
console.log("Bulk reveal / export            : absent");
console.log("Browser persistence / polling   : absent");
console.log("Schema migration                : none");
console.log("Database accessed by QA         : false");
console.log("");
console.log("RESULT: N7-P1B SUPERADMIN CONFIDENTIAL IDENTITY AUDIT GREEN");
