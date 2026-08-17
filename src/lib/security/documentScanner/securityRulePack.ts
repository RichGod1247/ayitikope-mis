import type {
  NativeDocumentOleStructuralEvidence,
  NativeDocumentOoxmlStructuralEvidence,
  NativeDocumentPdfStructuralEvidence,
  NativeDocumentScannerReasonCode,
  NativeDocumentSecurityEvidenceFamily,
  NativeDocumentSecurityRuleId,
  NativeDocumentSecurityRuleMatch,
  NativeDocumentSecurityRulePackEvaluation,
} from "./types";

export const HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_ID =
  "HEHXAGON_BASELINE_DOCUMENT_INGRESS" as const;

export const HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_VERSION =
  "HDS-M4-DOCUMENT-INGRESS-RULES-V1";

type EvidenceByFamily = {
  OOXML: NativeDocumentOoxmlStructuralEvidence;
  PDF: NativeDocumentPdfStructuralEvidence;
  OLE: NativeDocumentOleStructuralEvidence;
};

type SecurityRule<F extends NativeDocumentSecurityEvidenceFamily> = {
  ruleId: NativeDocumentSecurityRuleId;
  family: F;
  reasonCode: NativeDocumentScannerReasonCode;
  message: string;
  matches: (evidence: EvidenceByFamily[F]) => boolean;
};

const OOXML_RULES: readonly SecurityRule<"OOXML">[] = Object.freeze([
  {
    ruleId: "HDS-OOXML-001-VBA",
    family: "OOXML",
    reasonCode: "OOXML_VBA_PROJECT_BLOCKED",
    message:
      "A VBA project or VBA data capability is not permitted in macro-free institutional OOXML documents.",
    matches: (evidence) => evidence.vbaProjectDetected,
  },
  {
    ruleId: "HDS-OOXML-002-MACRO-CONTENT-TYPE",
    family: "OOXML",
    reasonCode: "OOXML_MACRO_ENABLED_CONTENT_TYPE_BLOCKED",
    message:
      "A macro-enabled OOXML content type is not permitted under DOCX/XLSX/PPTX ingress policy.",
    matches: (evidence) => evidence.macroEnabledContentTypeDetected,
  },
  {
    ruleId: "HDS-OOXML-003-ACTIVEX",
    family: "OOXML",
    reasonCode: "OOXML_ACTIVEX_BLOCKED",
    message:
      "ActiveX content is not permitted in institutional OOXML documents.",
    matches: (evidence) => evidence.activeXDetected,
  },
  {
    ruleId: "HDS-OOXML-004-EMBEDDED-OBJECT",
    family: "OOXML",
    reasonCode: "OOXML_EMBEDDED_OBJECT_BLOCKED",
    message:
      "Embedded OLE or package objects are not permitted in institutional OOXML documents.",
    matches: (evidence) => evidence.embeddedObjectDetected,
  },
  {
    ruleId: "HDS-OOXML-005-EXTERNAL-RELATIONSHIP",
    family: "OOXML",
    reasonCode: "OOXML_EXTERNAL_RELATIONSHIP_BLOCKED",
    message:
      "External OOXML relationships other than ordinary HTTP(S)/mailto hyperlinks are not permitted.",
    matches: (evidence) => evidence.blockedExternalRelationshipDetected,
  },
  {
    ruleId: "HDS-OOXML-006-REMOTE-TEMPLATE",
    family: "OOXML",
    reasonCode: "OOXML_REMOTE_TEMPLATE_BLOCKED",
    message:
      "Attached or remote template relationships are not permitted in institutional OOXML documents.",
    matches: (evidence) => evidence.remoteTemplateDetected,
  },
  {
    ruleId: "HDS-OOXML-007-EXECUTABLE-PART",
    family: "OOXML",
    reasonCode: "OOXML_EXECUTABLE_PACKAGE_PART_BLOCKED",
    message:
      "Executable or script-like package parts are not permitted in institutional OOXML documents.",
    matches: (evidence) => evidence.executablePackagePartDetected,
  },
]);

const PDF_RULES: readonly SecurityRule<"PDF">[] = Object.freeze([
  {
    ruleId: "HDS-PDF-001-ENCRYPTED",
    family: "PDF",
    reasonCode: "PDF_ENCRYPTED_BLOCKED",
    message:
      "Encrypted PDFs are not accepted because their complete active structure cannot be inspected by the current engine.",
    matches: (evidence) => evidence.encrypted,
  },
  {
    ruleId: "HDS-PDF-002-JAVASCRIPT",
    family: "PDF",
    reasonCode: "PDF_JAVASCRIPT_BLOCKED",
    message: "PDF JavaScript is not permitted in institutional document ingress.",
    matches: (evidence) => evidence.javascriptDetected,
  },
  {
    ruleId: "HDS-PDF-003-OPEN-ACTION",
    family: "PDF",
    reasonCode: "PDF_OPEN_ACTION_BLOCKED",
    message: "Automatic PDF open actions are not permitted for institutional document ingress.",
    matches: (evidence) => evidence.openActionDetected,
  },
  {
    ruleId: "HDS-PDF-004-ADDITIONAL-ACTION",
    family: "PDF",
    reasonCode: "PDF_ADDITIONAL_ACTION_BLOCKED",
    message: "PDF additional actions are not permitted for institutional document ingress.",
    matches: (evidence) => evidence.additionalActionDetected,
  },
  {
    ruleId: "HDS-PDF-005-LAUNCH-ACTION",
    family: "PDF",
    reasonCode: "PDF_LAUNCH_ACTION_BLOCKED",
    message: "PDF Launch actions are not permitted.",
    matches: (evidence) => evidence.launchActionDetected,
  },
  {
    ruleId: "HDS-PDF-006-EMBEDDED-FILE",
    family: "PDF",
    reasonCode: "PDF_EMBEDDED_FILE_BLOCKED",
    message: "Embedded file content is not permitted in institutional PDF ingress.",
    matches: (evidence) => evidence.embeddedFileDetected,
  },
  {
    ruleId: "HDS-PDF-007-RICH-MEDIA",
    family: "PDF",
    reasonCode: "PDF_RICH_MEDIA_BLOCKED",
    message: "Interactive rich-media PDF content is not permitted.",
    matches: (evidence) => evidence.richMediaDetected,
  },
  {
    ruleId: "HDS-PDF-008-XFA",
    family: "PDF",
    reasonCode: "PDF_XFA_BLOCKED",
    message: "XFA content is not permitted under the bounded institutional PDF policy.",
    matches: (evidence) => evidence.xfaDetected,
  },
  {
    ruleId: "HDS-PDF-009-EXTERNAL-ACTION",
    family: "PDF",
    reasonCode: "PDF_EXTERNAL_ACTION_BLOCKED",
    message:
      "PDF actions that submit, import, invoke remote content, or invoke renditions are not permitted.",
    matches: (evidence) => evidence.blockedExternalActionDetected,
  },
  {
    ruleId: "HDS-PDF-010-UNSAFE-URI",
    family: "PDF",
    reasonCode: "PDF_UNSAFE_URI_ACTION_BLOCKED",
    message:
      "Only bounded ordinary HTTP(S) and mailto PDF URI actions are permitted by the current ingress policy.",
    matches: (evidence) => evidence.unsafeUriActionDetected,
  },
]);

const OLE_RULES: readonly SecurityRule<"OLE">[] = Object.freeze([
  {
    ruleId: "HDS-OLE-001-VBA",
    family: "OLE",
    reasonCode: "OLE_VBA_PROJECT_BLOCKED",
    message: "A legacy Office VBA project is not permitted by the document ingress policy.",
    matches: (evidence) => evidence.vbaProjectDetected,
  },
  {
    ruleId: "HDS-OLE-002-EMBEDDED-OBJECT",
    family: "OLE",
    reasonCode: "OLE_EMBEDDED_OBJECT_BLOCKED",
    message: "An embedded OLE/package object is not permitted by the document ingress policy.",
    matches: (evidence) => evidence.embeddedObjectDetected,
  },
  {
    ruleId: "HDS-OLE-003-ENCRYPTED-PACKAGE",
    family: "OLE",
    reasonCode: "OLE_ENCRYPTED_PACKAGE_BLOCKED",
    message: "An encrypted compound-file package cannot be fully inspected safely.",
    matches: (evidence) => evidence.encryptedPackageDetected,
  },
  {
    ruleId: "HDS-OLE-004-EXECUTABLE-STREAM",
    family: "OLE",
    reasonCode: "OLE_EXECUTABLE_STREAM_BLOCKED",
    message: "Executable or script-like content was detected inside a legacy Office compound file.",
    matches: (evidence) => evidence.executableStreamDetected,
  },
]);

function evaluateRules<F extends NativeDocumentSecurityEvidenceFamily>(args: {
  family: F;
  evidence: EvidenceByFamily[F];
  rules: readonly SecurityRule<F>[];
}): NativeDocumentSecurityRulePackEvaluation {
  const matchedRules: NativeDocumentSecurityRuleMatch[] = [];

  for (const rule of args.rules) {
    if (!rule.matches(args.evidence)) continue;

    matchedRules.push({
      ruleId: rule.ruleId,
      family: rule.family,
      reasonCode: rule.reasonCode,
      severity: "BLOCK",
      message: rule.message,
    });
  }

  const immutableMatches = Object.freeze(
    matchedRules.map((match) => Object.freeze({ ...match })),
  );

  return Object.freeze({
    rulePackId: HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_ID,
    rulePackVersion: HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_VERSION,
    outcome: immutableMatches.length > 0 ? "BLOCK" : "PASS",
    evidenceFamily: args.family,
    matchedRules: immutableMatches,
  });
}

export function evaluateOoxmlSecurityRules(
  evidence: NativeDocumentOoxmlStructuralEvidence,
) {
  return evaluateRules({ family: "OOXML", evidence, rules: OOXML_RULES });
}

export function evaluatePdfSecurityRules(
  evidence: NativeDocumentPdfStructuralEvidence,
) {
  return evaluateRules({ family: "PDF", evidence, rules: PDF_RULES });
}

export function evaluateOleSecurityRules(
  evidence: NativeDocumentOleStructuralEvidence,
) {
  return evaluateRules({ family: "OLE", evidence, rules: OLE_RULES });
}

export const HEHXAGON_DOCUMENT_SECURITY_RULE_IDS = Object.freeze([
  ...OOXML_RULES.map((rule) => rule.ruleId),
  ...PDF_RULES.map((rule) => rule.ruleId),
  ...OLE_RULES.map((rule) => rule.ruleId),
]);
