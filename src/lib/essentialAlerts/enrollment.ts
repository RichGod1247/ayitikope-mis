import {
  EssentialAlertEnrollmentStatus,
  EssentialAlertRecipientKind,
  Prisma,
  StudentStatus,
  type EssentialAlertEnrollment,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ESSENTIAL_ALERT_POLICY,
  type EssentialAlertDecision,
  clean,
  guardianPolicyEvidence,
  guardianSubjectKey,
  normalizeGhanaPhone,
  staffPolicyEvidence,
  staffSubjectKey,
} from "@/lib/essentialAlerts/policy";
import {
  essentialAlertPhoneFingerprint,
  signEssentialAlertToken,
  verifyEssentialAlertCompactInvite,
  type EssentialAlertCompactInviteReference,
  type EssentialAlertTokenPayload,
} from "@/lib/essentialAlerts/tokens";

const STAFF_ALERT_ROLES = new Set([
  "TEACHER",
  "HEADTEACHER",
  "HEADMASTER",
]);

const LEGACY_TOKEN_ATTEMPT_TOLERANCE_MS = 5_000;
const MAX_GUARDIAN_DIRECTORY_STUDENTS = 5_000;

export class EssentialAlertEnrollmentError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "EssentialAlertEnrollmentError";
    this.code = code;
    this.status = status;
  }
}

function fail(code: string, status: number): never {
  throw new EssentialAlertEnrollmentError(code, status);
}

function normalizeRole(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function normalizeGuardianNameKey(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function childName(student: { firstName?: string | null; lastName?: string | null }) {
  return (
    [clean(student.firstName), clean(student.lastName)].filter(Boolean).join(" ") ||
    "Learner"
  );
}

function invitationExpiry(sentAt: Date) {
  return new Date(
    sentAt.getTime() + ESSENTIAL_ALERT_POLICY.invitationTtlDays * 86_400_000,
  );
}

function sameAttempt(left: Date | null, right: Date | null) {
  if (!left || !right) return false;
  return left.getTime() === right.getTime();
}

async function tenantName(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, status: true },
  });

  if (!tenant || tenant.status !== "ACTIVE") {
    fail("ESSENTIAL_ALERT_TENANT_INACTIVE", 409);
  }

  return tenant.name;
}

async function guardianContact(tenantId: string, studentId: string) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
      status: StudentStatus.ACTIVE,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
    },
  });

  if (!student) fail("ESSENTIAL_ALERT_STUDENT_NOT_FOUND", 404);

  const phoneNorm =
    normalizeGhanaPhone(student.guardianPhoneNorm) ??
    normalizeGhanaPhone(student.guardianPhone);

  if (!phoneNorm) fail("ESSENTIAL_ALERT_GUARDIAN_PHONE_MISSING", 409);

  const phoneFingerprint = essentialAlertPhoneFingerprint({
    tenantId,
    kind: "GUARDIAN",
    subjectId: student.id,
    phoneNorm,
  });

  return {
    student,
    phoneNorm,
    phoneFingerprint,
    subjectKey: guardianSubjectKey(student.id, phoneFingerprint),
  };
}

async function guardianFamilyContact(tenantId: string, seedStudentId: string) {
  const seed = await guardianContact(tenantId, seedStudentId);
  const guardianNameKey = normalizeGuardianNameKey(seed.student.guardianName);

  const candidates = guardianNameKey
    ? await prisma.student.findMany({
        where: {
          tenantId,
          status: StudentStatus.ACTIVE,
          OR: [
            { guardianPhoneNorm: { not: null } },
            { guardianPhone: { not: null } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          guardianName: true,
          guardianPhone: true,
          guardianPhoneNorm: true,
        },
        take: 5000,
      })
    : [seed.student];

  const members = candidates
    .filter((student) => {
      const phoneNorm =
        normalizeGhanaPhone(student.guardianPhoneNorm) ??
        normalizeGhanaPhone(student.guardianPhone);
      if (phoneNorm !== seed.phoneNorm) return false;

      // A phone number alone is not enough to merge households. When the
      // guardian name is missing we deliberately keep the invitation scoped
      // to the seed learner rather than risk revealing unrelated learners.
      if (!guardianNameKey) return student.id === seed.student.id;
      return normalizeGuardianNameKey(student.guardianName) === guardianNameKey;
    })
    .map((student) => {
      const phoneFingerprint = essentialAlertPhoneFingerprint({
        tenantId,
        kind: "GUARDIAN",
        subjectId: student.id,
        phoneNorm: seed.phoneNorm,
      });

      return {
        student,
        phoneNorm: seed.phoneNorm,
        phoneFingerprint,
        subjectKey: guardianSubjectKey(student.id, phoneFingerprint),
        childName: childName(student),
      };
    });

  if (!members.some((member) => member.student.id === seed.student.id)) {
    fail("ESSENTIAL_ALERT_GUARDIAN_FAMILY_RESOLUTION_FAILED", 409);
  }

  members.sort((a, b) =>
    a.childName.localeCompare(b.childName, "en", { sensitivity: "base" }),
  );

  return {
    seed,
    phoneNorm: seed.phoneNorm,
    guardianName: clean(seed.student.guardianName) || "Parent/Guardian",
    guardianNameKey,
    members,
    familyKey: `${seed.phoneNorm}|${guardianNameKey || `student:${seed.student.id}`}`,
  };
}


type GuardianFamilyContact = Awaited<ReturnType<typeof guardianFamilyContact>>;

type GuardianInvitationEnrollmentSnapshot = Pick<
  EssentialAlertEnrollment,
  | "id"
  | "subjectKey"
  | "status"
  | "lastInvitationAttemptAt"
  | "lastInvitationSentAt"
  | "invitationCount"
>;

async function guardianFamilyDirectory(
  tenantId: string,
): Promise<GuardianFamilyContact[]> {
  const candidates = await prisma.student.findMany({
    where: {
      tenantId,
      status: StudentStatus.ACTIVE,
      OR: [
        { guardianPhoneNorm: { not: null } },
        { guardianPhone: { not: null } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: MAX_GUARDIAN_DIRECTORY_STUDENTS + 1,
  });

  if (candidates.length > MAX_GUARDIAN_DIRECTORY_STUDENTS) {
    fail("ESSENTIAL_ALERT_GUARDIAN_DIRECTORY_LIMIT_EXCEEDED", 409);
  }

  const families = new Map<string, GuardianFamilyContact>();

  for (const student of candidates) {
    const phoneNorm =
      normalizeGhanaPhone(student.guardianPhoneNorm) ??
      normalizeGhanaPhone(student.guardianPhone);
    if (!phoneNorm) continue;

    const guardianNameKey = normalizeGuardianNameKey(student.guardianName);
    const familyKey = `${phoneNorm}|${
      guardianNameKey || `student:${student.id}`
    }`;
    const phoneFingerprint = essentialAlertPhoneFingerprint({
      tenantId,
      kind: "GUARDIAN",
      subjectId: student.id,
      phoneNorm,
    });
    const subjectKey = guardianSubjectKey(student.id, phoneFingerprint);
    const contact = {
      student,
      phoneNorm,
      phoneFingerprint,
      subjectKey,
    };
    const member = {
      student,
      phoneNorm,
      phoneFingerprint,
      subjectKey,
      childName: childName(student),
    };

    const existing = families.get(familyKey);
    if (existing) {
      existing.members.push(member);
      continue;
    }

    families.set(familyKey, {
      seed: contact,
      phoneNorm,
      guardianName: clean(student.guardianName) || "Parent/Guardian",
      guardianNameKey,
      members: [member],
      familyKey,
    });
  }

  const rows = [...families.values()];
  for (const family of rows) {
    family.members.sort((a, b) =>
      a.childName.localeCompare(b.childName, "en", { sensitivity: "base" }),
    );
  }
  return rows;
}

function materializeGuardianFamilyInvitation(input: {
  family: GuardianFamilyContact;
  schoolName: string;
  bySubjectKey: Map<string, GuardianInvitationEnrollmentSnapshot>;
  now: Date;
}) {
  const members = input.family.members.map((member) => {
    const row = input.bySubjectKey.get(member.subjectKey);
    const existingStatus = row?.status ?? null;
    const lastInvitationSentAt = row?.lastInvitationSentAt ?? null;

    return {
      studentId: member.student.id,
      childName: member.childName,
      subjectKey: member.subjectKey,
      phoneFingerprint: member.phoneFingerprint,
      enrollmentId: row?.id ?? null,
      existingStatus,
      lastInvitationAttemptAt: row?.lastInvitationAttemptAt ?? null,
      lastInvitationSentAt,
      invitationCount: row?.invitationCount ?? 0,
      canInvite: invitationMayBeSent({
        existingStatus,
        lastInvitationAttemptAt: row?.lastInvitationAttemptAt ?? null,
        lastInvitationSentAt,
        now: input.now,
      }),
    };
  });

  return {
    kind: "GUARDIAN" as const,
    seedStudentId: input.family.seed.student.id,
    familyKey: input.family.familyKey,
    to: input.family.phoneNorm,
    guardianName: input.family.guardianName,
    guardianNameKey: input.family.guardianNameKey,
    schoolName: input.schoolName,
    members,
    childNames: members.map((member) => member.childName),
    totalChildren: members.length,
    inviteableChildren: members.filter((member) => member.canInvite).length,
  };
}

export type GuardianFamilyEssentialAlertInvitation = ReturnType<
  typeof materializeGuardianFamilyInvitation
>;

async function revalidatePreparedGuardianFamily(input: {
  tenantId: string;
  seedStudentId: string;
  preparedFamily: GuardianFamilyEssentialAlertInvitation;
}): Promise<GuardianFamilyContact> {
  const prepared = input.preparedFamily;
  if (prepared.seedStudentId !== input.seedStudentId) {
    fail("ESSENTIAL_ALERT_GUARDIAN_FAMILY_RESOLUTION_FAILED", 409);
  }

  const memberIds = [
    ...new Set(prepared.members.map((member) => clean(member.studentId))),
  ].filter(Boolean);
  if (!memberIds.length || !memberIds.includes(input.seedStudentId)) {
    fail("ESSENTIAL_ALERT_GUARDIAN_FAMILY_RESOLUTION_FAILED", 409);
  }

  const phoneNorm = normalizeGhanaPhone(prepared.to);
  if (!phoneNorm) fail("ESSENTIAL_ALERT_GUARDIAN_PHONE_MISSING", 409);

  const students = await prisma.student.findMany({
    where: {
      tenantId: input.tenantId,
      status: StudentStatus.ACTIVE,
      id: { in: memberIds },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
    },
  });
  if (students.length !== memberIds.length) {
    fail("ESSENTIAL_ALERT_GUARDIAN_FAMILY_RESOLUTION_FAILED", 409);
  }

  const studentById = new Map(students.map((student) => [student.id, student]));
  const guardianNameKey = normalizeGuardianNameKey(prepared.guardianNameKey);
  const members = prepared.members.map((preparedMember) => {
    const student = studentById.get(preparedMember.studentId);
    if (!student) fail("ESSENTIAL_ALERT_GUARDIAN_FAMILY_RESOLUTION_FAILED", 409);

    const currentPhoneNorm =
      normalizeGhanaPhone(student.guardianPhoneNorm) ??
      normalizeGhanaPhone(student.guardianPhone);
    if (currentPhoneNorm !== phoneNorm) {
      fail("ESSENTIAL_ALERT_GUARDIAN_FAMILY_RESOLUTION_FAILED", 409);
    }

    if (
      guardianNameKey
        ? normalizeGuardianNameKey(student.guardianName) !== guardianNameKey
        : student.id !== input.seedStudentId || memberIds.length !== 1
    ) {
      fail("ESSENTIAL_ALERT_GUARDIAN_FAMILY_RESOLUTION_FAILED", 409);
    }

    const phoneFingerprint = essentialAlertPhoneFingerprint({
      tenantId: input.tenantId,
      kind: "GUARDIAN",
      subjectId: student.id,
      phoneNorm,
    });
    const subjectKey = guardianSubjectKey(student.id, phoneFingerprint);
    if (
      preparedMember.phoneFingerprint !== phoneFingerprint ||
      preparedMember.subjectKey !== subjectKey
    ) {
      fail("ESSENTIAL_ALERT_GUARDIAN_FAMILY_RESOLUTION_FAILED", 409);
    }

    return {
      student,
      phoneNorm,
      phoneFingerprint,
      subjectKey,
      childName: childName(student),
    };
  });

  const seedMember = members.find(
    (member) => member.student.id === input.seedStudentId,
  );
  if (!seedMember) {
    fail("ESSENTIAL_ALERT_GUARDIAN_FAMILY_RESOLUTION_FAILED", 409);
  }

  const familyKey = `${phoneNorm}|${
    guardianNameKey || `student:${input.seedStudentId}`
  }`;
  if (prepared.familyKey !== familyKey) {
    fail("ESSENTIAL_ALERT_GUARDIAN_FAMILY_RESOLUTION_FAILED", 409);
  }

  members.sort((a, b) =>
    a.childName.localeCompare(b.childName, "en", { sensitivity: "base" }),
  );

  return {
    seed: {
      student: seedMember.student,
      phoneNorm,
      phoneFingerprint: seedMember.phoneFingerprint,
      subjectKey: seedMember.subjectKey,
    },
    phoneNorm,
    guardianName: clean(seedMember.student.guardianName) || "Parent/Guardian",
    guardianNameKey,
    members,
    familyKey,
  };
}

export type GuardianEssentialAlertPurpose =
  (typeof ESSENTIAL_ALERT_POLICY.guardianPurposes)[number];

export type GuardianEssentialAlertEligibilityReason =
  | "ELIGIBLE"
  | "NO_PHONE"
  | "NOT_ENROLLED"
  | "PHONE_CHANGED"
  | "POLICY_VERSION_MISMATCH"
  | "CONSENT_EVIDENCE_MISMATCH"
  | "PURPOSE_NOT_ALLOWED";

export type GuardianEssentialAlertEligibility = {
  eligible: boolean;
  reason: GuardianEssentialAlertEligibilityReason;
  phoneNorm: string | null;
  enrollmentStatus: EssentialAlertEnrollmentStatus | null;
};

type GuardianEligibilityStudent = {
  id: string;
  guardianPhone?: string | null;
  guardianPhoneNorm?: string | null;
};

function guardianPurposeAllowed(
  purpose: string,
): purpose is GuardianEssentialAlertPurpose {
  return (ESSENTIAL_ALERT_POLICY.guardianPurposes as readonly string[]).includes(
    purpose,
  );
}

function guardianEvidenceAllowsPurpose(
  value: Prisma.JsonValue,
  purpose: GuardianEssentialAlertPurpose,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const evidence = value as Prisma.JsonObject;
  const purposes = evidence.purposes;

  return (
    evidence.policyId === ESSENTIAL_ALERT_POLICY.policyId &&
    evidence.policyVersion === ESSENTIAL_ALERT_POLICY.version &&
    evidence.decision === "ENABLE" &&
    evidence.consentSource === "SIGNED_GUARDIAN_LINK" &&
    evidence.healthConsentIncluded === false &&
    Array.isArray(purposes) &&
    purposes.some((entry) => entry === purpose)
  );
}

export async function getGuardianEssentialAlertEligibilityMap(input: {
  tenantId: string;
  purpose: GuardianEssentialAlertPurpose;
  students: GuardianEligibilityStudent[];
  tx?: Prisma.TransactionClient;
}) {
  const tenantId = clean(input.tenantId);
  if (!tenantId) {
    fail("ESSENTIAL_ALERT_ELIGIBILITY_INPUT_INVALID", 400);
  }

  const studentsById = new Map<string, GuardianEligibilityStudent>();
  for (const student of input.students) {
    const id = clean(student.id);
    if (id) studentsById.set(id, student);
  }

  const results = new Map<string, GuardianEssentialAlertEligibility>();
  if (!studentsById.size) return results;

  if (!guardianPurposeAllowed(input.purpose)) {
    for (const studentId of studentsById.keys()) {
      results.set(studentId, {
        eligible: false,
        reason: "PURPOSE_NOT_ALLOWED",
        phoneNorm: null,
        enrollmentStatus: null,
      });
    }
    return results;
  }

  const prepared: Array<{
    studentId: string;
    phoneNorm: string;
    phoneFingerprint: string;
  }> = [];

  for (const [studentId, student] of studentsById.entries()) {
    const phoneNorm =
      normalizeGhanaPhone(student.guardianPhoneNorm) ??
      normalizeGhanaPhone(student.guardianPhone);

    if (!phoneNorm) {
      results.set(studentId, {
        eligible: false,
        reason: "NO_PHONE",
        phoneNorm: null,
        enrollmentStatus: null,
      });
      continue;
    }

    prepared.push({
      studentId,
      phoneNorm,
      phoneFingerprint: essentialAlertPhoneFingerprint({
        tenantId,
        kind: "GUARDIAN",
        subjectId: studentId,
        phoneNorm,
      }),
    });
  }

  if (!prepared.length) return results;

  const eligibilityDb = input.tx ?? prisma;

  const enrollments = await eligibilityDb.essentialAlertEnrollment.findMany({
    where: {
      tenantId,
      recipientKind: EssentialAlertRecipientKind.GUARDIAN,
      studentId: { in: prepared.map((student) => student.studentId) },
    },
    select: {
      studentId: true,
      phoneNormSnapshot: true,
      phoneFingerprint: true,
      status: true,
      policyVersion: true,
      consentEvidenceJson: true,
    },
  });

  const rowsByStudent = new Map<string, typeof enrollments>();

  for (const row of enrollments) {
    if (!row.studentId) continue;
    const rows = rowsByStudent.get(row.studentId) ?? [];
    rows.push(row);
    rowsByStudent.set(row.studentId, rows);
  }

  for (const student of prepared) {
    const rows = rowsByStudent.get(student.studentId) ?? [];
    const current = rows.find(
      (row) => row.phoneFingerprint === student.phoneFingerprint,
    );

    if (!current) {
      results.set(student.studentId, {
        eligible: false,
        reason: rows.some(
          (row) => row.status === EssentialAlertEnrollmentStatus.ENROLLED,
        )
          ? "PHONE_CHANGED"
          : "NOT_ENROLLED",
        phoneNorm: student.phoneNorm,
        enrollmentStatus: null,
      });
      continue;
    }

    if (current.status !== EssentialAlertEnrollmentStatus.ENROLLED) {
      results.set(student.studentId, {
        eligible: false,
        reason: "NOT_ENROLLED",
        phoneNorm: student.phoneNorm,
        enrollmentStatus: current.status,
      });
      continue;
    }

    if (current.policyVersion !== ESSENTIAL_ALERT_POLICY.version) {
      results.set(student.studentId, {
        eligible: false,
        reason: "POLICY_VERSION_MISMATCH",
        phoneNorm: student.phoneNorm,
        enrollmentStatus: current.status,
      });
      continue;
    }

    if (
      current.phoneNormSnapshot !== student.phoneNorm ||
      !guardianEvidenceAllowsPurpose(current.consentEvidenceJson, input.purpose)
    ) {
      results.set(student.studentId, {
        eligible: false,
        reason:
          current.phoneNormSnapshot !== student.phoneNorm
            ? "PHONE_CHANGED"
            : "CONSENT_EVIDENCE_MISMATCH",
        phoneNorm: student.phoneNorm,
        enrollmentStatus: current.status,
      });
      continue;
    }

    results.set(student.studentId, {
      eligible: true,
      reason: "ELIGIBLE",
      phoneNorm: student.phoneNorm,
      enrollmentStatus: current.status,
    });
  }

  return results;
}

export type StaffEssentialAlertPurpose =
  (typeof ESSENTIAL_ALERT_POLICY.staffPurposes)[number];

export type StaffEssentialAlertEligibilityReason =
  | "ELIGIBLE"
  | "NOT_ACTIVE_STAFF"
  | "NO_PHONE"
  | "NOT_ENROLLED"
  | "PHONE_CHANGED"
  | "POLICY_VERSION_MISMATCH"
  | "CONSENT_EVIDENCE_MISMATCH"
  | "PURPOSE_NOT_ALLOWED";

export type StaffEssentialAlertEligibility = {
  eligible: boolean;
  reason: StaffEssentialAlertEligibilityReason;
  phoneNorm: string | null;
  enrollmentStatus: EssentialAlertEnrollmentStatus | null;
};

function staffPurposeAllowed(
  purpose: string,
): purpose is StaffEssentialAlertPurpose {
  return (ESSENTIAL_ALERT_POLICY.staffPurposes as readonly string[]).includes(
    purpose,
  );
}

function staffEvidenceAllowsPurpose(
  value: Prisma.JsonValue,
  purpose: StaffEssentialAlertPurpose,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const evidence = value as Prisma.JsonObject;
  const purposes = evidence.purposes;
  const consentSource = evidence.consentSource;

  return (
    evidence.policyId === ESSENTIAL_ALERT_POLICY.policyId &&
    evidence.policyVersion === ESSENTIAL_ALERT_POLICY.version &&
    evidence.decision === "ENABLE" &&
    (consentSource === "SIGNED_STAFF_LINK" ||
      consentSource === "AUTHENTICATED_STAFF_SELF_SERVICE") &&
    evidence.institutionFunded === true &&
    evidence.advertisingAllowed === false &&
    evidence.healthOrWellbeingConsentIncluded === false &&
    Array.isArray(purposes) &&
    purposes.some((entry) => entry === purpose)
  );
}

export async function getStaffEssentialAlertEligibilityMap(input: {
  tenantId: string;
  purpose: StaffEssentialAlertPurpose;
  userIds: string[];
}) {
  const tenantId = clean(input.tenantId);
  if (!tenantId) {
    fail("ESSENTIAL_ALERT_ELIGIBILITY_INPUT_INVALID", 400);
  }

  const userIds = [
    ...new Set(input.userIds.map((userId) => clean(userId)).filter(Boolean)),
  ];

  const results = new Map<string, StaffEssentialAlertEligibility>();
  if (!userIds.length) return results;

  if (!staffPurposeAllowed(input.purpose)) {
    for (const userId of userIds) {
      results.set(userId, {
        eligible: false,
        reason: "PURPOSE_NOT_ALLOWED",
        phoneNorm: null,
        enrollmentStatus: null,
      });
    }
    return results;
  }

  const [memberships, profiles] = await Promise.all([
    prisma.membership.findMany({
      where: {
        tenantId,
        userId: { in: userIds },
        status: "ACTIVE",
      },
      select: {
        userId: true,
        role: { select: { name: true } },
        user: {
          select: {
            id: true,
            phone: true,
            phoneNorm: true,
          },
        },
      },
    }),
    prisma.teacherProfile.findMany({
      where: {
        tenantId,
        userId: { in: userIds },
      },
      select: {
        userId: true,
        phone: true,
      },
    }),
  ]);

  const membershipByUserId = new Map<string, (typeof memberships)[number]>();

  for (const membership of memberships) {
    const role = normalizeRole(membership.role?.name);
    if (
      membership.user &&
      membership.user.id === membership.userId &&
      STAFF_ALERT_ROLES.has(role)
    ) {
      membershipByUserId.set(membership.userId, membership);
    }
  }

  const profilePhoneByUserId = new Map(
    profiles.map((profile) => [profile.userId, profile.phone] as const),
  );

  const prepared: Array<{
    userId: string;
    phoneNorm: string;
    phoneFingerprint: string;
  }> = [];

  for (const userId of userIds) {
    const membership = membershipByUserId.get(userId);

    if (!membership?.user) {
      results.set(userId, {
        eligible: false,
        reason: "NOT_ACTIVE_STAFF",
        phoneNorm: null,
        enrollmentStatus: null,
      });
      continue;
    }

    const phoneNorm =
      normalizeGhanaPhone(membership.user.phoneNorm) ??
      normalizeGhanaPhone(membership.user.phone) ??
      normalizeGhanaPhone(profilePhoneByUserId.get(userId));

    if (!phoneNorm) {
      results.set(userId, {
        eligible: false,
        reason: "NO_PHONE",
        phoneNorm: null,
        enrollmentStatus: null,
      });
      continue;
    }

    prepared.push({
      userId,
      phoneNorm,
      phoneFingerprint: essentialAlertPhoneFingerprint({
        tenantId,
        kind: "STAFF",
        subjectId: userId,
        phoneNorm,
      }),
    });
  }

  if (!prepared.length) return results;

  const enrollments = await prisma.essentialAlertEnrollment.findMany({
    where: {
      tenantId,
      recipientKind: EssentialAlertRecipientKind.STAFF,
      userId: { in: prepared.map((staff) => staff.userId) },
    },
    select: {
      userId: true,
      phoneNormSnapshot: true,
      phoneFingerprint: true,
      status: true,
      policyVersion: true,
      consentEvidenceJson: true,
    },
  });

  const rowsByUserId = new Map<string, typeof enrollments>();

  for (const row of enrollments) {
    if (!row.userId) continue;
    const rows = rowsByUserId.get(row.userId) ?? [];
    rows.push(row);
    rowsByUserId.set(row.userId, rows);
  }

  for (const staff of prepared) {
    const rows = rowsByUserId.get(staff.userId) ?? [];
    const current = rows.find(
      (row) => row.phoneFingerprint === staff.phoneFingerprint,
    );

    if (!current) {
      results.set(staff.userId, {
        eligible: false,
        reason: rows.some(
          (row) => row.status === EssentialAlertEnrollmentStatus.ENROLLED,
        )
          ? "PHONE_CHANGED"
          : "NOT_ENROLLED",
        phoneNorm: staff.phoneNorm,
        enrollmentStatus: null,
      });
      continue;
    }

    if (current.status !== EssentialAlertEnrollmentStatus.ENROLLED) {
      results.set(staff.userId, {
        eligible: false,
        reason: "NOT_ENROLLED",
        phoneNorm: staff.phoneNorm,
        enrollmentStatus: current.status,
      });
      continue;
    }

    if (current.policyVersion !== ESSENTIAL_ALERT_POLICY.version) {
      results.set(staff.userId, {
        eligible: false,
        reason: "POLICY_VERSION_MISMATCH",
        phoneNorm: staff.phoneNorm,
        enrollmentStatus: current.status,
      });
      continue;
    }

    if (
      current.phoneNormSnapshot !== staff.phoneNorm ||
      !staffEvidenceAllowsPurpose(current.consentEvidenceJson, input.purpose)
    ) {
      results.set(staff.userId, {
        eligible: false,
        reason:
          current.phoneNormSnapshot !== staff.phoneNorm
            ? "PHONE_CHANGED"
            : "CONSENT_EVIDENCE_MISMATCH",
        phoneNorm: staff.phoneNorm,
        enrollmentStatus: current.status,
      });
      continue;
    }

    results.set(staff.userId, {
      eligible: true,
      reason: "ELIGIBLE",
      phoneNorm: staff.phoneNorm,
      enrollmentStatus: current.status,
    });
  }

  return results;
}

async function staffContact(tenantId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: {
      tenantId,
      userId,
      status: "ACTIVE",
    },
    select: {
      userId: true,
      role: { select: { name: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          phoneNorm: true,
        },
      },
    },
  });

  if (!membership || !membership.user) {
    fail("ESSENTIAL_ALERT_STAFF_NOT_FOUND", 404);
  }

  const role = normalizeRole(membership.role?.name);
  if (!STAFF_ALERT_ROLES.has(role)) {
    fail("ESSENTIAL_ALERT_STAFF_ROLE_NOT_ELIGIBLE", 403);
  }

  const profile = await prisma.teacherProfile
    .findUnique({
      where: {
        teacherProfile_tenant_user_unique: {
          tenantId,
          userId,
        },
      },
      select: { phone: true },
    })
    .catch(() => null);

  const phoneNorm =
    normalizeGhanaPhone(membership.user.phoneNorm) ??
    normalizeGhanaPhone(membership.user.phone) ??
    normalizeGhanaPhone(profile?.phone);

  if (!phoneNorm) fail("ESSENTIAL_ALERT_STAFF_PHONE_MISSING", 409);

  const phoneFingerprint = essentialAlertPhoneFingerprint({
    tenantId,
    kind: "STAFF",
    subjectId: membership.user.id,
    phoneNorm,
  });

  return {
    membership,
    phoneNorm,
    phoneFingerprint,
    subjectKey: staffSubjectKey(membership.user.id, phoneFingerprint),
  };
}

export async function buildGuardianEssentialAlertInvitation(input: {
  tenantId: string;
  studentId: string;
  now?: Date;
}) {
  const tenantId = clean(input.tenantId);
  const studentId = clean(input.studentId);
  if (!tenantId || !studentId) {
    fail("ESSENTIAL_ALERT_INVITATION_INPUT_INVALID", 400);
  }

  const [{ student, phoneNorm, phoneFingerprint, subjectKey }, schoolName] =
    await Promise.all([
      guardianContact(tenantId, studentId),
      tenantName(tenantId),
    ]);

  const existing = await prisma.essentialAlertEnrollment.findUnique({
    where: { tenantId_subjectKey: { tenantId, subjectKey } },
    select: {
      id: true,
      status: true,
      lastInvitationAttemptAt: true,
      lastInvitationSentAt: true,
      invitationCount: true,
    },
  });

  const token = signEssentialAlertToken({
    tenantId,
    kind: "GUARDIAN",
    studentId,
    phoneFingerprint,
    now: input.now,
  });

  return {
    kind: "GUARDIAN" as const,
    studentId,
    subjectKey,
    to: phoneNorm,
    phoneFingerprint,
    token,
    schoolName,
    guardianName: clean(student.guardianName) || "Parent/Guardian",
    childName: childName(student),
    enrollmentId: existing?.id ?? null,
    existingStatus: existing?.status ?? null,
    lastInvitationAttemptAt: existing?.lastInvitationAttemptAt ?? null,
    lastInvitationSentAt: existing?.lastInvitationSentAt ?? null,
    invitationCount: existing?.invitationCount ?? 0,
  };
}

export async function buildGuardianFamilyEssentialAlertInvitation(input: {
  tenantId: string;
  studentId: string;
  now?: Date;
}) {
  const tenantId = clean(input.tenantId);
  const studentId = clean(input.studentId);
  if (!tenantId || !studentId) {
    fail("ESSENTIAL_ALERT_INVITATION_INPUT_INVALID", 400);
  }

  const [family, schoolName] = await Promise.all([
    guardianFamilyContact(tenantId, studentId),
    tenantName(tenantId),
  ]);

  const existing = await prisma.essentialAlertEnrollment.findMany({
    where: {
      tenantId,
      subjectKey: { in: family.members.map((member) => member.subjectKey) },
    },
    select: {
      id: true,
      subjectKey: true,
      status: true,
      lastInvitationAttemptAt: true,
      lastInvitationSentAt: true,
      invitationCount: true,
    },
  });

  return materializeGuardianFamilyInvitation({
    family,
    schoolName,
    bySubjectKey: new Map(existing.map((row) => [row.subjectKey, row])),
    now: input.now ? new Date(input.now) : new Date(),
  });
}

export async function buildGuardianFamilyEssentialAlertInvitationBatch(input: {
  tenantId: string;
  limit: number;
  now?: Date;
}): Promise<GuardianFamilyEssentialAlertInvitation[]> {
  const tenantId = clean(input.tenantId);
  const requestedLimit = Number(input.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 300)
    : 50;

  if (!tenantId) {
    fail("ESSENTIAL_ALERT_INVITATION_INPUT_INVALID", 400);
  }

  const [directory, schoolName] = await Promise.all([
    guardianFamilyDirectory(tenantId),
    tenantName(tenantId),
  ]);
  if (!directory.length) return [];

  const subjectKeys = [
    ...new Set(
      directory.flatMap((family) =>
        family.members.map((member) => member.subjectKey),
      ),
    ),
  ];

  const existing = await prisma.essentialAlertEnrollment.findMany({
    where: {
      tenantId,
      subjectKey: { in: subjectKeys },
    },
    select: {
      id: true,
      subjectKey: true,
      status: true,
      lastInvitationAttemptAt: true,
      lastInvitationSentAt: true,
      invitationCount: true,
    },
  });
  const bySubjectKey = new Map(existing.map((row) => [row.subjectKey, row]));
  const now = input.now ? new Date(input.now) : new Date();

  const materialized = directory.map((family) =>
    materializeGuardianFamilyInvitation({
      family,
      schoolName,
      bySubjectKey,
      now,
    }),
  );
  const inviteable = materialized.filter(
    (family) => family.inviteableChildren > 0,
  );
  const notInviteable = materialized.filter(
    (family) => family.inviteableChildren === 0,
  );

  return [...inviteable, ...notInviteable].slice(0, limit);
}

export async function buildStaffEssentialAlertInvitation(input: {
  tenantId: string;
  userId: string;
  now?: Date;
}) {
  const tenantId = clean(input.tenantId);
  const userId = clean(input.userId);
  if (!tenantId || !userId) {
    fail("ESSENTIAL_ALERT_INVITATION_INPUT_INVALID", 400);
  }

  const [{ membership, phoneNorm, phoneFingerprint, subjectKey }, schoolName] =
    await Promise.all([
      staffContact(tenantId, userId),
      tenantName(tenantId),
    ]);

  const existing = await prisma.essentialAlertEnrollment.findUnique({
    where: { tenantId_subjectKey: { tenantId, subjectKey } },
    select: {
      id: true,
      status: true,
      lastInvitationAttemptAt: true,
      lastInvitationSentAt: true,
      invitationCount: true,
    },
  });

  const token = signEssentialAlertToken({
    tenantId,
    kind: "STAFF",
    userId,
    phoneFingerprint,
    now: input.now,
  });

  return {
    kind: "STAFF" as const,
    userId,
    subjectKey,
    to: phoneNorm,
    phoneFingerprint,
    token,
    schoolName,
    staffName:
      clean(membership.user.name) ||
      clean(membership.user.email) ||
      "Staff member",
    role: normalizeRole(membership.role?.name),
    enrollmentId: existing?.id ?? null,
    existingStatus: existing?.status ?? null,
    lastInvitationAttemptAt: existing?.lastInvitationAttemptAt ?? null,
    lastInvitationSentAt: existing?.lastInvitationSentAt ?? null,
    invitationCount: existing?.invitationCount ?? 0,
  };
}

export function invitationMayBeSent(input: {
  existingStatus: EssentialAlertEnrollmentStatus | null;
  lastInvitationAttemptAt?: Date | null;
  lastInvitationSentAt: Date | null;
  now?: Date;
}) {
  const now = input.now ? new Date(input.now) : new Date();
  return attemptMayProceed({
    status: input.existingStatus,
    lastInvitationAttemptAt: input.lastInvitationAttemptAt ?? null,
    lastInvitationSentAt: input.lastInvitationSentAt,
    now,
  });
}

function attemptMayProceed(input: {
  status: EssentialAlertEnrollmentStatus | null;
  lastInvitationAttemptAt: Date | null;
  lastInvitationSentAt: Date | null;
  now: Date;
}) {
  if (
    input.status === EssentialAlertEnrollmentStatus.ENROLLED ||
    input.status === EssentialAlertEnrollmentStatus.OPTED_OUT
  ) {
    return false;
  }

  if (input.lastInvitationAttemptAt) {
    const gap =
      ESSENTIAL_ALERT_POLICY.minimumInvitationAttemptGapMinutes * 60 * 1000;
    if (input.now.getTime() - input.lastInvitationAttemptAt.getTime() < gap) {
      return false;
    }
  }

  if (input.lastInvitationSentAt) {
    const resendAge =
      ESSENTIAL_ALERT_POLICY.minimumInvitationResendHours * 60 * 60 * 1000;
    if (input.now.getTime() - input.lastInvitationSentAt.getTime() < resendAge) {
      return false;
    }
  }

  return true;
}

export async function recordEssentialAlertInvitationAttempt(input: {
  tenantId: string;
  kind: "GUARDIAN" | "STAFF";
  subjectId: string;
  subjectKey: string;
  phoneNorm: string;
  phoneFingerprint: string;
  actorUserId: string;
  now?: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const now = input.now ? new Date(input.now) : new Date();
  const recipientKind =
    input.kind === "GUARDIAN"
      ? EssentialAlertRecipientKind.GUARDIAN
      : EssentialAlertRecipientKind.STAFF;

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.essentialAlertEnrollment.findUnique({
        where: {
          tenantId_subjectKey: {
            tenantId: input.tenantId,
            subjectKey: input.subjectKey,
          },
        },
        select: {
          id: true,
          status: true,
          firstInvitedAt: true,
          lastInvitationAttemptAt: true,
          lastInvitationSentAt: true,
          invitationCount: true,
        },
      });

      if (
        !attemptMayProceed({
          status: existing?.status ?? null,
          lastInvitationAttemptAt: existing?.lastInvitationAttemptAt ?? null,
          lastInvitationSentAt: existing?.lastInvitationSentAt ?? null,
          now,
        })
      ) {
        return { allowed: false as const, row: existing };
      }

      const row = existing
        ? await tx.essentialAlertEnrollment.update({
            where: { id: existing.id },
            data: {
              phoneNormSnapshot: input.phoneNorm,
              phoneFingerprint: input.phoneFingerprint,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              status: EssentialAlertEnrollmentStatus.INVITED,
              consentSource: null,
              consentedAt: null,
              optedOutAt: null,
              consentEvidenceJson: json({}),
              firstInvitedAt: existing.firstInvitedAt ?? now,
              lastInvitationAttemptAt: now,
              lastInvitationSentAt: null,
              invitationCount: { increment: 1 },
            },
          })
        : await tx.essentialAlertEnrollment.create({
            data: {
              tenantId: input.tenantId,
              subjectKey: input.subjectKey,
              recipientKind,
              ...(input.kind === "GUARDIAN"
                ? { studentId: input.subjectId }
                : { userId: input.subjectId }),
              phoneNormSnapshot: input.phoneNorm,
              phoneFingerprint: input.phoneFingerprint,
              status: EssentialAlertEnrollmentStatus.INVITED,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              firstInvitedAt: now,
              lastInvitationAttemptAt: now,
              invitationCount: 1,
            },
          });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.actorUserId,
          action: "ESSENTIAL_ALERT_INVITATION_ATTEMPTED",
          resource: "EssentialAlertEnrollment",
          resourceId: row.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
            recipientKind: input.kind,
            subjectId: input.subjectId,
            subjectKey: input.subjectKey,
            phoneFingerprint: input.phoneFingerprint,
            rawPhoneIncluded: false,
            providerCalledInsideTransaction: false,
          },
        },
      });

      return { allowed: true as const, row };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

export async function recordGuardianFamilyInvitationAttempt(input: {
  tenantId: string;
  seedStudentId: string;
  actorUserId: string;
  preparedFamily?: GuardianFamilyEssentialAlertInvitation;
  now?: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const now = input.now ? new Date(input.now) : new Date();
  const family = input.preparedFamily
    ? await revalidatePreparedGuardianFamily({
        tenantId: input.tenantId,
        seedStudentId: input.seedStudentId,
        preparedFamily: input.preparedFamily,
      })
    : await guardianFamilyContact(input.tenantId, input.seedStudentId);

  return prisma.$transaction(
    async (tx) => {
      const existingRows = await tx.essentialAlertEnrollment.findMany({
        where: {
          tenantId: input.tenantId,
          subjectKey: { in: family.members.map((member) => member.subjectKey) },
        },
      });
      const bySubjectKey = new Map(
        existingRows.map((row) => [row.subjectKey, row]),
      );

      const rows: EssentialAlertEnrollment[] = [];
      for (const member of family.members) {
        const existing = bySubjectKey.get(member.subjectKey);
        if (
          !attemptMayProceed({
            status: existing?.status ?? null,
            lastInvitationAttemptAt: existing?.lastInvitationAttemptAt ?? null,
            lastInvitationSentAt: existing?.lastInvitationSentAt ?? null,
            now,
          })
        ) {
          continue;
        }

        const row = existing
          ? await tx.essentialAlertEnrollment.update({
              where: { id: existing.id },
              data: {
                phoneNormSnapshot: member.phoneNorm,
                phoneFingerprint: member.phoneFingerprint,
                policyVersion: ESSENTIAL_ALERT_POLICY.version,
                status: EssentialAlertEnrollmentStatus.INVITED,
                consentSource: null,
                consentedAt: null,
                optedOutAt: null,
                consentEvidenceJson: json({}),
                firstInvitedAt: existing.firstInvitedAt ?? now,
                lastInvitationAttemptAt: now,
                lastInvitationSentAt: null,
                invitationCount: { increment: 1 },
              },
            })
          : await tx.essentialAlertEnrollment.create({
              data: {
                tenantId: input.tenantId,
                subjectKey: member.subjectKey,
                recipientKind: EssentialAlertRecipientKind.GUARDIAN,
                studentId: member.student.id,
                phoneNormSnapshot: member.phoneNorm,
                phoneFingerprint: member.phoneFingerprint,
                status: EssentialAlertEnrollmentStatus.INVITED,
                policyVersion: ESSENTIAL_ALERT_POLICY.version,
                firstInvitedAt: now,
                lastInvitationAttemptAt: now,
                invitationCount: 1,
              },
            });

        rows.push(row);

        await tx.auditLog.create({
          data: {
            tenantId: input.tenantId,
            userId: input.actorUserId,
            action: "ESSENTIAL_ALERT_INVITATION_ATTEMPTED",
            resource: "EssentialAlertEnrollment",
            resourceId: row.id,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              policyId: ESSENTIAL_ALERT_POLICY.policyId,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              recipientKind: "GUARDIAN",
              subjectId: member.student.id,
              subjectKey: member.subjectKey,
              phoneFingerprint: member.phoneFingerprint,
              familyInvitation: true,
              familyLearnerCount: family.members.length,
              rawPhoneIncluded: false,
              providerCalledInsideTransaction: false,
            },
          },
        });
      }

      return {
        allowed: rows.length > 0,
        rows,
        anchorRow: rows[0] ?? null,
        family: {
          seedStudentId: family.seed.student.id,
          to: family.phoneNorm,
          guardianName: family.guardianName,
          childNames: family.members.map((member) => member.childName),
          totalChildren: family.members.length,
        },
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

export async function recordEssentialAlertInvitationSent(input: {
  enrollmentId: string;
  tenantId: string;
  actorUserId: string;
  expectedInvitationCount: number;
  now?: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const expectedInvitationCount = Number(input.expectedInvitationCount);
  if (
    !Number.isInteger(expectedInvitationCount) ||
    expectedInvitationCount < 1
  ) {
    fail("ESSENTIAL_ALERT_INVITATION_ATTEMPT_REQUIRED", 400);
  }

  const now = input.now ? new Date(input.now) : new Date();

  return prisma.$transaction(
    async (tx) => {
      const claimed = await tx.essentialAlertEnrollment.updateMany({
        where: {
          id: input.enrollmentId,
          tenantId: input.tenantId,
          status: EssentialAlertEnrollmentStatus.INVITED,
          policyVersion: ESSENTIAL_ALERT_POLICY.version,
          invitationCount: expectedInvitationCount,
          lastInvitationSentAt: null,
        },
        data: { lastInvitationSentAt: now },
      });

      if (claimed.count !== 1) {
        fail("ESSENTIAL_ALERT_INVITATION_SENT_ATTEMPT_MISMATCH", 409);
      }

      const row = await tx.essentialAlertEnrollment.findFirst({
        where: {
          id: input.enrollmentId,
          tenantId: input.tenantId,
        },
      });
      if (!row) {
        fail("ESSENTIAL_ALERT_INVITATION_NOT_FOUND", 409);
      }

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.actorUserId,
          action: "ESSENTIAL_ALERT_INVITATION_SENT",
          resource: "EssentialAlertEnrollment",
          resourceId: row.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
            recipientKind: row.recipientKind,
            subjectKey: row.subjectKey,
            phoneFingerprint: row.phoneFingerprint,
            invitationCount: expectedInvitationCount,
            attemptBound: true,
            rawPhoneIncluded: false,
          },
        },
      });

      return row;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

export async function recordGuardianFamilyInvitationSent(input: {
  attempts: Array<{
    enrollmentId: string;
    invitationCount: number;
  }>;
  tenantId: string;
  actorUserId: string;
  now?: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const attemptsById = new Map<string, number>();

  for (const attempt of input.attempts) {
    const enrollmentId = clean(attempt.enrollmentId);
    const invitationCount = Number(attempt.invitationCount);
    if (
      !enrollmentId ||
      !Number.isInteger(invitationCount) ||
      invitationCount < 1
    ) {
      fail("ESSENTIAL_ALERT_FAMILY_INVITATION_ROWS_REQUIRED", 400);
    }

    const existingCount = attemptsById.get(enrollmentId);
    if (
      existingCount !== undefined &&
      existingCount !== invitationCount
    ) {
      fail("ESSENTIAL_ALERT_INVITATION_SENT_ATTEMPT_MISMATCH", 409);
    }
    attemptsById.set(enrollmentId, invitationCount);
  }

  if (!attemptsById.size) {
    fail("ESSENTIAL_ALERT_FAMILY_INVITATION_ROWS_REQUIRED", 400);
  }

  const now = input.now ? new Date(input.now) : new Date();

  return prisma.$transaction(
    async (tx) => {
      const rows: EssentialAlertEnrollment[] = [];

      for (const [enrollmentId, invitationCount] of attemptsById) {
        const claimed = await tx.essentialAlertEnrollment.updateMany({
          where: {
            id: enrollmentId,
            tenantId: input.tenantId,
            recipientKind: EssentialAlertRecipientKind.GUARDIAN,
            status: EssentialAlertEnrollmentStatus.INVITED,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
            invitationCount,
            lastInvitationSentAt: null,
          },
          data: { lastInvitationSentAt: now },
        });

        if (claimed.count !== 1) {
          fail("ESSENTIAL_ALERT_INVITATION_SENT_ATTEMPT_MISMATCH", 409);
        }

        const row = await tx.essentialAlertEnrollment.findFirst({
          where: {
            id: enrollmentId,
            tenantId: input.tenantId,
          },
        });
        if (!row) {
          fail("ESSENTIAL_ALERT_INVITATION_NOT_FOUND", 409);
        }

        rows.push(row);

        await tx.auditLog.create({
          data: {
            tenantId: input.tenantId,
            userId: input.actorUserId,
            action: "ESSENTIAL_ALERT_INVITATION_SENT",
            resource: "EssentialAlertEnrollment",
            resourceId: row.id,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              policyId: ESSENTIAL_ALERT_POLICY.policyId,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              recipientKind: row.recipientKind,
              subjectKey: row.subjectKey,
              phoneFingerprint: row.phoneFingerprint,
              invitationCount,
              attemptBound: true,
              familyInvitation: true,
              familyBatchSize: attemptsById.size,
              rawPhoneIncluded: false,
            },
          },
        });
      }

      return rows;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

function legacyTokenMatchesCurrentAttempt(
  token: EssentialAlertTokenPayload,
  lastInvitationAttemptAt: Date | null,
) {
  if (!lastInvitationAttemptAt) return false;
  return (
    Math.abs(lastInvitationAttemptAt.getTime() - token.iat * 1000) <=
    LEGACY_TOKEN_ATTEMPT_TOLERANCE_MS
  );
}

function decisionStatus(decision: EssentialAlertDecision) {
  return decision === "ENABLE"
    ? EssentialAlertEnrollmentStatus.ENROLLED
    : EssentialAlertEnrollmentStatus.OPTED_OUT;
}

function decisionTimes(input: {
  decision: EssentialAlertDecision;
  existingConsentedAt: Date | null;
  now: Date;
}) {
  return {
    consentedAt:
      input.decision === "ENABLE"
        ? input.existingConsentedAt ?? input.now
        : input.existingConsentedAt,
    optedOutAt: input.decision === "DECLINE" ? input.now : null,
  };
}

async function applyLegacyGuardianDecision(input: {
  token: EssentialAlertTokenPayload;
  decision: EssentialAlertDecision;
  now: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const token = input.token;
  const seedId = clean(token.sid);
  const family = await guardianFamilyContact(token.tid, seedId);
  const seed = family.members.find((member) => member.student.id === seedId);
  if (!seed || seed.phoneFingerprint !== token.pf) {
    fail("ESSENTIAL_ALERT_PHONE_CHANGED", 409);
  }

  const policyEvidence = guardianPolicyEvidence();
  const status = decisionStatus(input.decision);
  const consentSource = "SIGNED_GUARDIAN_LINK";

  return prisma.$transaction(
    async (tx) => {
      const anchor = await tx.essentialAlertEnrollment.findUnique({
        where: {
          tenantId_subjectKey: {
            tenantId: token.tid,
            subjectKey: seed.subjectKey,
          },
        },
      });

      if (!anchor) fail("ESSENTIAL_ALERT_INVITATION_NOT_FOUND", 409);
      if (anchor.status !== EssentialAlertEnrollmentStatus.INVITED) {
        fail("ESSENTIAL_ALERT_LINK_ALREADY_USED", 409);
      }
      if (anchor.policyVersion !== ESSENTIAL_ALERT_POLICY.version) {
        fail("ESSENTIAL_ALERT_POLICY_VERSION_MISMATCH", 409);
      }
      if (!anchor.lastInvitationSentAt) {
        fail("ESSENTIAL_ALERT_INVITATION_NOT_SENT", 409);
      }
      if (!legacyTokenMatchesCurrentAttempt(token, anchor.lastInvitationAttemptAt)) {
        fail("ESSENTIAL_ALERT_LINK_SUPERSEDED", 409);
      }

      const familyRows = await tx.essentialAlertEnrollment.findMany({
        where: {
          tenantId: token.tid,
          subjectKey: { in: family.members.map((member) => member.subjectKey) },
        },
      });

      const targetRows = familyRows.filter(
        (row) =>
          row.status === EssentialAlertEnrollmentStatus.INVITED &&
          row.policyVersion === ESSENTIAL_ALERT_POLICY.version &&
          sameAttempt(row.lastInvitationAttemptAt, anchor.lastInvitationAttemptAt),
      );

      if (!targetRows.length) fail("ESSENTIAL_ALERT_LINK_ALREADY_USED", 409);

      const updatedRows: EssentialAlertEnrollment[] = [];
      for (const row of targetRows) {
        const member = family.members.find(
          (candidate) => candidate.subjectKey === row.subjectKey,
        );
        if (!member || member.phoneNorm !== row.phoneNormSnapshot) continue;

        const times = decisionTimes({
          decision: input.decision,
          existingConsentedAt: row.consentedAt,
          now: input.now,
        });
        const evidence = json({
          ...policyEvidence,
          decision: input.decision,
          consentSource,
          invitation: {
            format: "LEGACY_SIGNED_TOKEN_V1",
            issuedAtUnix: token.iat,
            expiresAtUnix: token.exp,
            familyDecision: true,
            familyLearnerCount: targetRows.length,
            rawPhoneIncluded: false,
          },
          decidedAt: input.now.toISOString(),
        });

        const updated = await tx.essentialAlertEnrollment.update({
          where: { id: row.id },
          data: {
            phoneNormSnapshot: member.phoneNorm,
            phoneFingerprint: member.phoneFingerprint,
            status,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
            consentSource,
            consentedAt: times.consentedAt,
            optedOutAt: times.optedOutAt,
            consentEvidenceJson: evidence,
          },
        });
        updatedRows.push(updated);

        await tx.auditLog.create({
          data: {
            tenantId: token.tid,
            userId: null,
            action:
              input.decision === "ENABLE"
                ? "ESSENTIAL_ALERT_ENROLLED"
                : "ESSENTIAL_ALERT_OPTED_OUT",
            resource: "EssentialAlertEnrollment",
            resourceId: updated.id,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              policyId: ESSENTIAL_ALERT_POLICY.policyId,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              recipientKind: "GUARDIAN",
              subjectId: updated.studentId,
              subjectKey: updated.subjectKey,
              consentSource,
              phoneFingerprint: updated.phoneFingerprint,
              familyDecision: true,
              familyLearnerCount: targetRows.length,
              rawPhoneIncluded: false,
              healthConsentChanged: false,
              legacySmsOptInChanged: false,
            },
          },
        });
      }

      if (!updatedRows.length) fail("ESSENTIAL_ALERT_PHONE_CHANGED", 409);
      return updatedRows;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

async function applyLegacyStaffDecision(input: {
  token: EssentialAlertTokenPayload;
  decision: EssentialAlertDecision;
  now: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const token = input.token;
  const subjectId = clean(token.uid);
  const contact = await staffContact(token.tid, subjectId);
  if (contact.phoneFingerprint !== token.pf) {
    fail("ESSENTIAL_ALERT_PHONE_CHANGED", 409);
  }

  const status = decisionStatus(input.decision);
  const consentSource = "SIGNED_STAFF_LINK";

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.essentialAlertEnrollment.findUnique({
        where: {
          tenantId_subjectKey: {
            tenantId: token.tid,
            subjectKey: contact.subjectKey,
          },
        },
      });

      if (!existing) fail("ESSENTIAL_ALERT_INVITATION_NOT_FOUND", 409);
      if (existing.status !== EssentialAlertEnrollmentStatus.INVITED) {
        fail("ESSENTIAL_ALERT_LINK_ALREADY_USED", 409);
      }
      if (existing.policyVersion !== ESSENTIAL_ALERT_POLICY.version) {
        fail("ESSENTIAL_ALERT_POLICY_VERSION_MISMATCH", 409);
      }
      if (!existing.lastInvitationSentAt) {
        fail("ESSENTIAL_ALERT_INVITATION_NOT_SENT", 409);
      }
      if (!legacyTokenMatchesCurrentAttempt(token, existing.lastInvitationAttemptAt)) {
        fail("ESSENTIAL_ALERT_LINK_SUPERSEDED", 409);
      }

      const times = decisionTimes({
        decision: input.decision,
        existingConsentedAt: existing.consentedAt,
        now: input.now,
      });
      const evidence = json({
        ...staffPolicyEvidence(),
        decision: input.decision,
        consentSource,
        invitation: {
          format: "LEGACY_SIGNED_TOKEN_V1",
          issuedAtUnix: token.iat,
          expiresAtUnix: token.exp,
          rawPhoneIncluded: false,
        },
        decidedAt: input.now.toISOString(),
      });

      const row = await tx.essentialAlertEnrollment.update({
        where: { id: existing.id },
        data: {
          phoneNormSnapshot: contact.phoneNorm,
          phoneFingerprint: contact.phoneFingerprint,
          status,
          policyVersion: ESSENTIAL_ALERT_POLICY.version,
          consentSource,
          consentedAt: times.consentedAt,
          optedOutAt: times.optedOutAt,
          consentEvidenceJson: evidence,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: token.tid,
          userId: null,
          action:
            input.decision === "ENABLE"
              ? "ESSENTIAL_ALERT_ENROLLED"
              : "ESSENTIAL_ALERT_OPTED_OUT",
          resource: "EssentialAlertEnrollment",
          resourceId: row.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
            recipientKind: "STAFF",
            subjectId,
            subjectKey: row.subjectKey,
            consentSource,
            phoneFingerprint: row.phoneFingerprint,
            rawPhoneIncluded: false,
            healthConsentChanged: false,
            legacySmsOptInChanged: false,
          },
        },
      });

      return [row];
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

export async function applyEssentialAlertTokenDecision(input: {
  token: EssentialAlertTokenPayload;
  decision: EssentialAlertDecision;
  now?: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const now = input.now ? new Date(input.now) : new Date();

  if (input.token.pv !== ESSENTIAL_ALERT_POLICY.version) {
    fail("ESSENTIAL_ALERT_POLICY_VERSION_MISMATCH", 409);
  }

  return input.token.kind === "GUARDIAN"
    ? applyLegacyGuardianDecision({ ...input, now })
    : applyLegacyStaffDecision({ ...input, now });
}

export type EssentialAlertCompactInvitationState =
  | "READY"
  | "USED_ENABLED"
  | "USED_DECLINED"
  | "EXPIRED"
  | "SUPERSEDED"
  | "NOT_SENT"
  | "PHONE_CHANGED"
  | "POLICY_VERSION_MISMATCH"
  | "UNAVAILABLE";

export type EssentialAlertCompactInvitationContext =
  | {
      kind: "GUARDIAN";
      reference: EssentialAlertCompactInviteReference;
      state: EssentialAlertCompactInvitationState;
      schoolName: string;
      guardianName: string;
      children: Array<{
        studentId: string;
        name: string;
        enrollmentStatus: EssentialAlertEnrollmentStatus | null;
        includedInInvitation: boolean;
      }>;
      expiresAt: Date | null;
    }
  | {
      kind: "STAFF";
      reference: EssentialAlertCompactInviteReference;
      state: EssentialAlertCompactInvitationState;
      schoolName: string;
      staffName: string;
      role: string;
      expiresAt: Date | null;
    };

function compactRowState(input: {
  status: EssentialAlertEnrollmentStatus;
  policyVersion: number;
  invitationCount: number;
  expectedInvitationCount: number;
  lastInvitationSentAt: Date | null;
  now: Date;
}): EssentialAlertCompactInvitationState {
  if (input.invitationCount !== input.expectedInvitationCount) return "SUPERSEDED";
  if (input.policyVersion !== ESSENTIAL_ALERT_POLICY.version) {
    return "POLICY_VERSION_MISMATCH";
  }
  if (input.status === EssentialAlertEnrollmentStatus.ENROLLED) {
    return "USED_ENABLED";
  }
  if (input.status === EssentialAlertEnrollmentStatus.OPTED_OUT) {
    return "USED_DECLINED";
  }
  if (!input.lastInvitationSentAt) return "NOT_SENT";
  if (invitationExpiry(input.lastInvitationSentAt).getTime() < input.now.getTime()) {
    return "EXPIRED";
  }
  return "READY";
}

export async function resolveEssentialAlertCompactInvitation(input: {
  code: string;
  now?: Date;
}): Promise<EssentialAlertCompactInvitationContext | null> {
  const reference = verifyEssentialAlertCompactInvite(input.code);
  if (!reference) return null;

  const now = input.now ? new Date(input.now) : new Date();
  const row = await prisma.essentialAlertEnrollment.findUnique({
    where: { id: reference.enrollmentId },
    select: {
      id: true,
      tenantId: true,
      recipientKind: true,
      studentId: true,
      userId: true,
      phoneNormSnapshot: true,
      phoneFingerprint: true,
      status: true,
      policyVersion: true,
      lastInvitationAttemptAt: true,
      lastInvitationSentAt: true,
      invitationCount: true,
    },
  });

  if (!row || row.recipientKind !== reference.kind) return null;

  let state = compactRowState({
    status: row.status,
    policyVersion: row.policyVersion,
    invitationCount: row.invitationCount,
    expectedInvitationCount: reference.invitationCount,
    lastInvitationSentAt: row.lastInvitationSentAt,
    now,
  });
  const expiresAt = row.lastInvitationSentAt
    ? invitationExpiry(row.lastInvitationSentAt)
    : null;

  if (reference.kind === "GUARDIAN") {
    if (!row.studentId) return null;

    let family;
    try {
      family = await guardianFamilyContact(row.tenantId, row.studentId);
    } catch {
      state = "UNAVAILABLE";
      family = null;
    }

    if (family) {
      const anchor = family.members.find(
        (member) => member.student.id === row.studentId,
      );
      if (
        !anchor ||
        anchor.phoneFingerprint !== row.phoneFingerprint ||
        anchor.phoneNorm !== row.phoneNormSnapshot
      ) {
        state = "PHONE_CHANGED";
      }

      const familyRows = await prisma.essentialAlertEnrollment.findMany({
        where: {
          tenantId: row.tenantId,
          subjectKey: { in: family.members.map((member) => member.subjectKey) },
        },
        select: {
          studentId: true,
          subjectKey: true,
          status: true,
          lastInvitationAttemptAt: true,
        },
      });
      const bySubjectKey = new Map(
        familyRows.map((familyRow) => [familyRow.subjectKey, familyRow]),
      );

      return {
        kind: "GUARDIAN",
        reference,
        state,
        schoolName: await tenantName(row.tenantId),
        guardianName: family.guardianName,
        children: family.members.map((member) => {
          const enrollment = bySubjectKey.get(member.subjectKey);
          return {
            studentId: member.student.id,
            name: member.childName,
            enrollmentStatus: enrollment?.status ?? null,
            includedInInvitation:
              Boolean(row.lastInvitationAttemptAt) &&
              sameAttempt(
                enrollment?.lastInvitationAttemptAt ?? null,
                row.lastInvitationAttemptAt,
              ),
          };
        }),
        expiresAt,
      };
    }

    return {
      kind: "GUARDIAN",
      reference,
      state,
      schoolName: await tenantName(row.tenantId).catch(() => "School"),
      guardianName: "Parent/Guardian",
      children: [],
      expiresAt,
    };
  }

  if (!row.userId) return null;
  let contact;
  try {
    contact = await staffContact(row.tenantId, row.userId);
  } catch {
    state = "UNAVAILABLE";
    contact = null;
  }

  if (
    contact &&
    (contact.phoneFingerprint !== row.phoneFingerprint ||
      contact.phoneNorm !== row.phoneNormSnapshot)
  ) {
    state = "PHONE_CHANGED";
  }

  return {
    kind: "STAFF",
    reference,
    state,
    schoolName: await tenantName(row.tenantId).catch(() => "School"),
    staffName:
      contact?.membership.user.name ||
      contact?.membership.user.email ||
      "Staff member",
    role: contact ? normalizeRole(contact.membership.role?.name) : "STAFF",
    expiresAt,
  };
}

export async function applyEssentialAlertCompactDecision(input: {
  code: string;
  decision: EssentialAlertDecision;
  now?: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const reference = verifyEssentialAlertCompactInvite(input.code);
  if (!reference) fail("ESSENTIAL_ALERT_SHORT_LINK_INVALID", 400);

  const now = input.now ? new Date(input.now) : new Date();

  if (reference.kind === "GUARDIAN") {
    const anchor = await prisma.essentialAlertEnrollment.findUnique({
      where: { id: reference.enrollmentId },
      select: { tenantId: true, studentId: true },
    });
    if (!anchor?.studentId) fail("ESSENTIAL_ALERT_INVITATION_NOT_FOUND", 409);

    const family = await guardianFamilyContact(anchor.tenantId, anchor.studentId);
    const status = decisionStatus(input.decision);
    const consentSource = "SIGNED_GUARDIAN_LINK";

    return prisma.$transaction(
      async (tx) => {
        const currentAnchor = await tx.essentialAlertEnrollment.findUnique({
          where: { id: reference.enrollmentId },
        });
        if (!currentAnchor) fail("ESSENTIAL_ALERT_INVITATION_NOT_FOUND", 409);
        if (currentAnchor.recipientKind !== EssentialAlertRecipientKind.GUARDIAN) {
          fail("ESSENTIAL_ALERT_SHORT_LINK_KIND_MISMATCH", 409);
        }
        if (currentAnchor.invitationCount !== reference.invitationCount) {
          fail("ESSENTIAL_ALERT_LINK_SUPERSEDED", 409);
        }
        if (currentAnchor.status !== EssentialAlertEnrollmentStatus.INVITED) {
          fail("ESSENTIAL_ALERT_LINK_ALREADY_USED", 409);
        }
        if (currentAnchor.policyVersion !== ESSENTIAL_ALERT_POLICY.version) {
          fail("ESSENTIAL_ALERT_POLICY_VERSION_MISMATCH", 409);
        }
        if (!currentAnchor.lastInvitationSentAt) {
          fail("ESSENTIAL_ALERT_INVITATION_NOT_SENT", 409);
        }
        if (invitationExpiry(currentAnchor.lastInvitationSentAt).getTime() < now.getTime()) {
          fail("ESSENTIAL_ALERT_LINK_EXPIRED", 409);
        }

        const anchorMember = family.members.find(
          (member) => member.student.id === currentAnchor.studentId,
        );
        if (
          !anchorMember ||
          anchorMember.phoneFingerprint !== currentAnchor.phoneFingerprint ||
          anchorMember.phoneNorm !== currentAnchor.phoneNormSnapshot
        ) {
          fail("ESSENTIAL_ALERT_PHONE_CHANGED", 409);
        }

        const rows = await tx.essentialAlertEnrollment.findMany({
          where: {
            tenantId: currentAnchor.tenantId,
            subjectKey: { in: family.members.map((member) => member.subjectKey) },
          },
        });

        const targets = rows.filter(
          (row) =>
            row.status === EssentialAlertEnrollmentStatus.INVITED &&
            row.policyVersion === ESSENTIAL_ALERT_POLICY.version &&
            sameAttempt(
              row.lastInvitationAttemptAt,
              currentAnchor.lastInvitationAttemptAt,
            ),
        );
        if (!targets.length) fail("ESSENTIAL_ALERT_LINK_ALREADY_USED", 409);

        const updatedRows: EssentialAlertEnrollment[] = [];
        for (const row of targets) {
          const member = family.members.find(
            (candidate) => candidate.subjectKey === row.subjectKey,
          );
          if (
            !member ||
            member.phoneNorm !== row.phoneNormSnapshot ||
            member.phoneFingerprint !== row.phoneFingerprint
          ) {
            fail("ESSENTIAL_ALERT_PHONE_CHANGED", 409);
          }

          const times = decisionTimes({
            decision: input.decision,
            existingConsentedAt: row.consentedAt,
            now,
          });
          const evidence = json({
            ...guardianPolicyEvidence(),
            decision: input.decision,
            consentSource,
            invitation: {
              format: "COMPACT_SIGNED_REFERENCE_V1",
              invitationCount: row.invitationCount,
              familyDecision: true,
              familyLearnerCount: targets.length,
              expiresAt: invitationExpiry(currentAnchor.lastInvitationSentAt).toISOString(),
              rawPhoneIncluded: false,
            },
            decidedAt: now.toISOString(),
          });

          const updated = await tx.essentialAlertEnrollment.update({
            where: { id: row.id },
            data: {
              phoneNormSnapshot: member.phoneNorm,
              phoneFingerprint: member.phoneFingerprint,
              status,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              consentSource,
              consentedAt: times.consentedAt,
              optedOutAt: times.optedOutAt,
              consentEvidenceJson: evidence,
            },
          });
          updatedRows.push(updated);

          await tx.auditLog.create({
            data: {
              tenantId: currentAnchor.tenantId,
              userId: null,
              action:
                input.decision === "ENABLE"
                  ? "ESSENTIAL_ALERT_ENROLLED"
                  : "ESSENTIAL_ALERT_OPTED_OUT",
              resource: "EssentialAlertEnrollment",
              resourceId: updated.id,
              ip: input.ip ?? null,
              userAgent: input.userAgent ?? null,
              metadata: {
                policyId: ESSENTIAL_ALERT_POLICY.policyId,
                policyVersion: ESSENTIAL_ALERT_POLICY.version,
                recipientKind: "GUARDIAN",
                subjectId: updated.studentId,
                subjectKey: updated.subjectKey,
                consentSource,
                phoneFingerprint: updated.phoneFingerprint,
                compactLink: true,
                familyDecision: true,
                familyLearnerCount: targets.length,
                rawPhoneIncluded: false,
                healthConsentChanged: false,
                legacySmsOptInChanged: false,
              },
            },
          });
        }

        return updatedRows;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 20_000,
      },
    );
  }

  const anchor = await prisma.essentialAlertEnrollment.findUnique({
    where: { id: reference.enrollmentId },
    select: { tenantId: true, userId: true },
  });
  if (!anchor?.userId) fail("ESSENTIAL_ALERT_INVITATION_NOT_FOUND", 409);
  const contact = await staffContact(anchor.tenantId, anchor.userId);
  const status = decisionStatus(input.decision);
  const consentSource = "SIGNED_STAFF_LINK";

  return prisma.$transaction(
    async (tx) => {
      const row = await tx.essentialAlertEnrollment.findUnique({
        where: { id: reference.enrollmentId },
      });
      if (!row) fail("ESSENTIAL_ALERT_INVITATION_NOT_FOUND", 409);
      if (row.recipientKind !== EssentialAlertRecipientKind.STAFF) {
        fail("ESSENTIAL_ALERT_SHORT_LINK_KIND_MISMATCH", 409);
      }
      if (row.invitationCount !== reference.invitationCount) {
        fail("ESSENTIAL_ALERT_LINK_SUPERSEDED", 409);
      }
      if (row.status !== EssentialAlertEnrollmentStatus.INVITED) {
        fail("ESSENTIAL_ALERT_LINK_ALREADY_USED", 409);
      }
      if (row.policyVersion !== ESSENTIAL_ALERT_POLICY.version) {
        fail("ESSENTIAL_ALERT_POLICY_VERSION_MISMATCH", 409);
      }
      if (!row.lastInvitationSentAt) fail("ESSENTIAL_ALERT_INVITATION_NOT_SENT", 409);
      if (invitationExpiry(row.lastInvitationSentAt).getTime() < now.getTime()) {
        fail("ESSENTIAL_ALERT_LINK_EXPIRED", 409);
      }
      if (
        contact.phoneNorm !== row.phoneNormSnapshot ||
        contact.phoneFingerprint !== row.phoneFingerprint
      ) {
        fail("ESSENTIAL_ALERT_PHONE_CHANGED", 409);
      }

      const times = decisionTimes({
        decision: input.decision,
        existingConsentedAt: row.consentedAt,
        now,
      });
      const evidence = json({
        ...staffPolicyEvidence(),
        decision: input.decision,
        consentSource,
        invitation: {
          format: "COMPACT_SIGNED_REFERENCE_V1",
          invitationCount: row.invitationCount,
          expiresAt: invitationExpiry(row.lastInvitationSentAt).toISOString(),
          rawPhoneIncluded: false,
        },
        decidedAt: now.toISOString(),
      });

      const updated = await tx.essentialAlertEnrollment.update({
        where: { id: row.id },
        data: {
          phoneNormSnapshot: contact.phoneNorm,
          phoneFingerprint: contact.phoneFingerprint,
          status,
          policyVersion: ESSENTIAL_ALERT_POLICY.version,
          consentSource,
          consentedAt: times.consentedAt,
          optedOutAt: times.optedOutAt,
          consentEvidenceJson: evidence,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: row.tenantId,
          userId: null,
          action:
            input.decision === "ENABLE"
              ? "ESSENTIAL_ALERT_ENROLLED"
              : "ESSENTIAL_ALERT_OPTED_OUT",
          resource: "EssentialAlertEnrollment",
          resourceId: updated.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
            recipientKind: "STAFF",
            subjectId: updated.userId,
            subjectKey: updated.subjectKey,
            consentSource,
            phoneFingerprint: updated.phoneFingerprint,
            compactLink: true,
            rawPhoneIncluded: false,
            healthConsentChanged: false,
            legacySmsOptInChanged: false,
          },
        },
      });

      return [updated];
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

export async function setAuthenticatedStaffEssentialAlerts(input: {
  tenantId: string;
  userId: string;
  enabled: boolean;
  actorUserId: string;
  now?: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  if (input.userId !== input.actorUserId) {
    fail("ESSENTIAL_ALERT_STAFF_SELF_ONLY", 403);
  }

  const now = input.now ? new Date(input.now) : new Date();
  const contact = await staffContact(input.tenantId, input.userId);
  const status = input.enabled
    ? EssentialAlertEnrollmentStatus.ENROLLED
    : EssentialAlertEnrollmentStatus.OPTED_OUT;

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.essentialAlertEnrollment.findUnique({
        where: {
          tenantId_subjectKey: {
            tenantId: input.tenantId,
            subjectKey: contact.subjectKey,
          },
        },
      });

      const row = existing
        ? await tx.essentialAlertEnrollment.update({
            where: { id: existing.id },
            data: {
              phoneNormSnapshot: contact.phoneNorm,
              phoneFingerprint: contact.phoneFingerprint,
              status,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              consentSource: "AUTHENTICATED_STAFF_SELF_SERVICE",
              consentedAt: input.enabled
                ? existing.consentedAt ?? now
                : existing.consentedAt,
              optedOutAt: input.enabled ? null : now,
              consentEvidenceJson: json({
                ...staffPolicyEvidence(),
                decision: input.enabled ? "ENABLE" : "DECLINE",
                consentSource: "AUTHENTICATED_STAFF_SELF_SERVICE",
                decidedAt: now.toISOString(),
              }),
            },
          })
        : await tx.essentialAlertEnrollment.create({
            data: {
              tenantId: input.tenantId,
              subjectKey: contact.subjectKey,
              recipientKind: EssentialAlertRecipientKind.STAFF,
              userId: input.userId,
              phoneNormSnapshot: contact.phoneNorm,
              phoneFingerprint: contact.phoneFingerprint,
              status,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              consentSource: "AUTHENTICATED_STAFF_SELF_SERVICE",
              consentedAt: input.enabled ? now : null,
              optedOutAt: input.enabled ? null : now,
              consentEvidenceJson: json({
                ...staffPolicyEvidence(),
                decision: input.enabled ? "ENABLE" : "DECLINE",
                consentSource: "AUTHENTICATED_STAFF_SELF_SERVICE",
                decidedAt: now.toISOString(),
              }),
            },
          });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.actorUserId,
          action: input.enabled
            ? "ESSENTIAL_ALERT_STAFF_SELF_ENROLLED"
            : "ESSENTIAL_ALERT_STAFF_SELF_OPTED_OUT",
          resource: "EssentialAlertEnrollment",
          resourceId: row.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
            phoneFingerprint: contact.phoneFingerprint,
            rawPhoneIncluded: false,
            legacySmsOptInChanged: false,
          },
        },
      });

      return row;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

export function essentialAlertStatusLabel(
  status: EssentialAlertEnrollmentStatus | null | undefined,
) {
  switch (status) {
    case EssentialAlertEnrollmentStatus.INVITED:
      return "INVITED" as const;
    case EssentialAlertEnrollmentStatus.ENROLLED:
      return "ENROLLED" as const;
    case EssentialAlertEnrollmentStatus.OPTED_OUT:
      return "OPTED_OUT" as const;
    default:
      return "NOT_ENROLLED" as const;
  }
}
