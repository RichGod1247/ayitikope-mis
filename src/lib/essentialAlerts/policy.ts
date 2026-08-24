export const ESSENTIAL_ALERT_POLICY = {
  policyId: "EDULIFE_ESSENTIAL_SCHOOL_ALERTS_V1",
  version: 1,
  invitationTtlDays: 14,
  minimumInvitationResendHours: 24,
  minimumInvitationAttemptGapMinutes: 10,
  firstSchoolTermFree: true,
  paidContinuationNoticeDays: 14,
  automaticPaidRenewal: false,
  advertisingAllowed: false,
  senderId: "EDULIFEOS",
  guardianPurposes: [
    "STUDENT_ATTENDANCE",
    "FEE_PAYMENT",
    "FEE_ACCOUNT_NOTICE",
    "RESULTS_RELEASE",
  ] as const,
  staffPurposes: [
    "LESSON_NOTE_WORKFLOW",
    "OFFICIAL_APPRAISAL",
  ] as const,
} as const;

export type EssentialAlertRecipientKind = "GUARDIAN" | "STAFF";
export type EssentialAlertDecision = "ENABLE" | "DECLINE";

export function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeGhanaPhone(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 10 && digits.startsWith("0")) {
    return `+233${digits.slice(1)}`;
  }

  if (digits.length === 12 && digits.startsWith("233")) {
    return `+${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

export function guardianSubjectKey(studentId: string, phoneFingerprint: string) {
  return `GUARDIAN:${clean(studentId)}:${clean(phoneFingerprint).toLowerCase()}`;
}

export function staffSubjectKey(userId: string, phoneFingerprint: string) {
  return `STAFF:${clean(userId)}:${clean(phoneFingerprint).toLowerCase()}`;
}

export function guardianPolicyEvidence() {
  return {
    policyId: ESSENTIAL_ALERT_POLICY.policyId,
    policyVersion: ESSENTIAL_ALERT_POLICY.version,
    purposes: [...ESSENTIAL_ALERT_POLICY.guardianPurposes],
    firstSchoolTermFree: ESSENTIAL_ALERT_POLICY.firstSchoolTermFree,
    paidContinuationNoticeDays:
      ESSENTIAL_ALERT_POLICY.paidContinuationNoticeDays,
    automaticPaidRenewal: ESSENTIAL_ALERT_POLICY.automaticPaidRenewal,
    advertisingAllowed: ESSENTIAL_ALERT_POLICY.advertisingAllowed,
    healthConsentIncluded: false,
  };
}

export function staffPolicyEvidence() {
  return {
    policyId: ESSENTIAL_ALERT_POLICY.policyId,
    policyVersion: ESSENTIAL_ALERT_POLICY.version,
    purposes: [...ESSENTIAL_ALERT_POLICY.staffPurposes],
    institutionFunded: true,
    advertisingAllowed: ESSENTIAL_ALERT_POLICY.advertisingAllowed,
    healthOrWellbeingConsentIncluded: false,
  };
}
