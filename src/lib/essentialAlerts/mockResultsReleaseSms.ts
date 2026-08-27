function cleanStr(value: unknown) {
  return String(value ?? "").trim();
}

export function mockResultsReleaseLearnerLabel(names: string[]) {
  const uniqueNames = [...new Set(names.map(cleanStr).filter(Boolean))];

  if (uniqueNames.length === 0) return "your child";
  if (uniqueNames.length === 1) return uniqueNames[0];
  if (uniqueNames.length === 2) {
    return `${uniqueNames[0]} & ${uniqueNames[1]}`;
  }

  return `${uniqueNames[0]}, ${uniqueNames[1]} +${uniqueNames.length - 2} more`;
}

export function buildMockResultsReleaseSmsBody(args: {
  schoolName: string;
  studentNames: string[];
  mockLabel: string;
  parentPortalUrl: string;
}) {
  const schoolName = cleanStr(args.schoolName) || "Your school";
  const mockLabel = cleanStr(args.mockLabel) || "Mock";
  const parentPortalUrl = cleanStr(args.parentPortalUrl);

  if (!parentPortalUrl) {
    throw new Error("MOCK_RESULTS_RELEASE_PARENT_PORTAL_URL_REQUIRED");
  }

  return `EduLife OS: ${mockLabel} BECE readiness for ${mockResultsReleaseLearnerLabel(args.studentNames)} at ${schoolName} is ready. View: ${parentPortalUrl}`;
}
