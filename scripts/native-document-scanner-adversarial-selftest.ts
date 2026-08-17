import { createHash } from "crypto";

import {
  HEHXAGON_DOCUMENT_SECURITY_ENGINE,
  HEHXAGON_DOCUMENT_SECURITY_ENGINE_VERSION,
  inspectNativeDocumentIdentity,
} from "../src/lib/security/documentScanner/nativeDocumentScanner";
import {
  HEHXAGON_DOCUMENT_SECURITY_RULE_IDS,
  HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_VERSION,
} from "../src/lib/security/documentScanner/securityRulePack";
import type {
  NativeDocumentPdfLimits,
  NativeDocumentScannerReasonCode,
  NativeDocumentScannerResult,
  NativeDocumentScannerVerdict,
  NativeDocumentSecurityRuleId,
} from "../src/lib/security/documentScanner/types";

export const HDS_M6_ADVERSARIAL_CORPUS_SCHEMA_VERSION =
  "HDS-M6-ADVERSARIAL-CORPUS-V1" as const;

export const HDS_M6A_HARNESS_VERSION =
  "HDS-M6A-HARNESS-V1" as const;

const ONE_MEBIBYTE = 1024 * 1024;

const PDF_LIMITS: NativeDocumentPdfLimits = Object.freeze({
  maxObjects: 128,
  maxIncrementalUpdates: 4,
  maxNestingDepth: 24,
  maxTokenBytes: 4096,
  maxStringBytes: 64 * 1024,
  maxDecodedXrefStreamBytes: 256 * 1024,
  maxDecodedObjectStreamBytes: 2 * 1024 * 1024,
  maxObjectsPerObjectStream: 64,
});

const THREAT_FAMILIES = Object.freeze([
  "IDENTITY_AMBIGUITY",
  "POLYGLOT",
  "OOXML_CONTAINER_EVASION",
  "OOXML_RELATIONSHIP_EVASION",
  "OOXML_MACRO_EVASION",
  "PDF_INCREMENTAL_UPDATE_EVASION",
  "PDF_XREF_EVASION",
  "PDF_OBJECT_STREAM_EVASION",
  "PDF_ACTION_EVASION",
  "PDF_URI_EVASION",
  "PDF_EMBEDDED_CONTENT_EVASION",
  "OLE_FAT_DIFAT_EVASION",
  "OLE_MINIFAT_EVASION",
  "OLE_DIRECTORY_EVASION",
  "OLE_VBA_EVASION",
  "OLE_EMBEDDED_OBJECT_EVASION",
  "RESOURCE_EXHAUSTION",
  "TRUNCATION",
  "HASH_SIZE_IDENTITY_RACE",
  "RULE_ORDER_DETERMINISM",
  "FALSE_POSITIVE_CONTROL",
] as const);

type ThreatFamily = (typeof THREAT_FAMILIES)[number];

type CertificationPhase =
  | "M6B"
  | "M6C"
  | "M6D"
  | "M6E"
  | "M6F"
  | "M6G";

type ThreatFamilyManifestEntry = Readonly<{
  threatFamily: ThreatFamily;
  plannedPhase: CertificationPhase;
  certificationStatus: "NOT_CERTIFIED";
  objective: string;
}>;

type CorpusCaseContract = Readonly<{
  caseId: string;
  threatFamily: ThreatFamily;
  format: "GENERIC" | "PDF" | "OOXML" | "OLE";
  attackTechnique: string;
  expectedVerdict: NativeDocumentScannerVerdict;
  expectedReasonCode: NativeDocumentScannerReasonCode;
  expectedRuleId: NativeDocumentSecurityRuleId | null;
  benignControl: boolean;
  provenance: "DETERMINISTIC_GENERATED";
  certificationPhase: "M6A" | CertificationPhase;
  certificationCredit: boolean;
  authorityImplication: "NO_CLEAN_AUTHORITY";
}>;

const THREAT_FAMILY_MANIFEST: readonly ThreatFamilyManifestEntry[] =
  Object.freeze([
    Object.freeze({
      threatFamily: "IDENTITY_AMBIGUITY",
      plannedPhase: "M6B",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Challenge declared extension, MIME, filename, signature and container identity assumptions.",
    }),
    Object.freeze({
      threatFamily: "POLYGLOT",
      plannedPhase: "M6B",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Construct multi-format byte sequences that intentionally satisfy competing container signatures.",
    }),
    Object.freeze({
      threatFamily: "OOXML_CONTAINER_EVASION",
      plannedPhase: "M6C",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Attack ZIP local/central metadata, path normalization, overlap, bounds and archive identity assumptions.",
    }),
    Object.freeze({
      threatFamily: "OOXML_RELATIONSHIP_EVASION",
      plannedPhase: "M6C",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Attack relationship type, target, target mode, XML representation and external-reference interpretation.",
    }),
    Object.freeze({
      threatFamily: "OOXML_MACRO_EVASION",
      plannedPhase: "M6C",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Hide macro or active-content capability through alternate package paths, types and relationships.",
    }),
    Object.freeze({
      threatFamily: "PDF_INCREMENTAL_UPDATE_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Challenge revision precedence, Prev chains, hybrid references and active-object selection.",
    }),
    Object.freeze({
      threatFamily: "PDF_XREF_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Attack classic and stream cross-reference consistency, offsets, generations and supplemental xrefs.",
    }),
    Object.freeze({
      threatFamily: "PDF_OBJECT_STREAM_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Hide active structures in compressed objects and challenge object-stream indexing and precedence.",
    }),
    Object.freeze({
      threatFamily: "PDF_ACTION_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Represent prohibited PDF actions through indirect, nested, encoded and revision-dependent structures.",
    }),
    Object.freeze({
      threatFamily: "PDF_URI_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Challenge URI normalization and allowed-scheme boundaries with encoded and ambiguous targets.",
    }),
    Object.freeze({
      threatFamily: "PDF_EMBEDDED_CONTENT_EVASION",
      plannedPhase: "M6D",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Hide files, rich media or executable-like payload capability behind indirect structural references.",
    }),
    Object.freeze({
      threatFamily: "OLE_FAT_DIFAT_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Attack FAT/DIFAT ownership, marker consistency, chain termination and sector aliasing.",
    }),
    Object.freeze({
      threatFamily: "OLE_MINIFAT_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Attack MiniFAT chains, root mini-stream bounds, mini-sector aliasing and declared-size semantics.",
    }),
    Object.freeze({
      threatFamily: "OLE_DIRECTORY_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Challenge directory reachability, sibling trees, duplicate names, parentage and application identity.",
    }),
    Object.freeze({
      threatFamily: "OLE_VBA_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Hide VBA capability through alternate storage names, paths and stream arrangements.",
    }),
    Object.freeze({
      threatFamily: "OLE_EMBEDDED_OBJECT_EVASION",
      plannedPhase: "M6E",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Hide package and OLE-native embedded-object capability through alternate directory layouts.",
    }),
    Object.freeze({
      threatFamily: "RESOURCE_EXHAUSTION",
      plannedPhase: "M6F",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Exercise bounded parser ceilings without unbounded memory, decompression, nesting or chain traversal.",
    }),
    Object.freeze({
      threatFamily: "TRUNCATION",
      plannedPhase: "M6F",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Truncate documents at structural boundaries and prove fail-closed deterministic outcomes.",
    }),
    Object.freeze({
      threatFamily: "HASH_SIZE_IDENTITY_RACE",
      plannedPhase: "M6F",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Challenge expected size and SHA-256 integrity contracts across fragmented and inconsistent sources.",
    }),
    Object.freeze({
      threatFamily: "RULE_ORDER_DETERMINISM",
      plannedPhase: "M6F",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Prove identical structural evidence yields immutable, stable rule ordering and policy outcomes.",
    }),
    Object.freeze({
      threatFamily: "FALSE_POSITIVE_CONTROL",
      plannedPhase: "M6G",
      certificationStatus: "NOT_CERTIFIED",
      objective:
        "Protect legitimate documents and ordinary allowed hyperlinks from adversarial over-blocking.",
    }),
  ]);

const HARNESS_SENTINEL_CASES: readonly CorpusCaseContract[] =
  Object.freeze([
    Object.freeze({
      caseId: "HDS-M6A-SENTINEL-001-SAFE-PDF",
      threatFamily: "FALSE_POSITIVE_CONTROL",
      format: "PDF",
      attackTechnique: "Known-safe classic PDF control traverses the real scanner path.",
      expectedVerdict: "IDENTITY_VERIFIED",
      expectedReasonCode:
        "SECURITY_RULE_PACK_PASSED_ADDITIONAL_INSPECTION_REQUIRED",
      expectedRuleId: null,
      benignControl: true,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6A",
      certificationCredit: false,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6A-SENTINEL-002-PE-AS-PDF",
      threatFamily: "IDENTITY_AMBIGUITY",
      format: "GENERIC",
      attackTechnique: "PE executable signature declared as an application/pdf document.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "EXECUTABLE_SIGNATURE_DETECTED",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6A",
      certificationCredit: false,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6A-SENTINEL-003-SHA-MISMATCH",
      threatFamily: "HASH_SIZE_IDENTITY_RACE",
      format: "PDF",
      attackTechnique: "Correct document bytes supplied with an intentionally incorrect expected SHA-256.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "SHA256_MISMATCH",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6A",
      certificationCredit: false,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6A-SENTINEL-004-TRUNCATED-SIZE",
      threatFamily: "TRUNCATION",
      format: "PDF",
      attackTechnique: "Complete deterministic source is declared one byte larger than the bytes actually supplied.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "SIZE_MISMATCH",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6A",
      certificationCredit: false,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
    Object.freeze({
      caseId: "HDS-M6A-SENTINEL-005-SIZE-EXCEEDS-EXPECTED",
      threatFamily: "HASH_SIZE_IDENTITY_RACE",
      format: "PDF",
      attackTechnique: "The byte source contains more data than the caller-declared expected size.",
      expectedVerdict: "BLOCKED",
      expectedReasonCode: "SIZE_EXCEEDS_EXPECTED",
      expectedRuleId: null,
      benignControl: false,
      provenance: "DETERMINISTIC_GENERATED",
      certificationPhase: "M6A",
      certificationCredit: false,
      authorityImplication: "NO_CLEAN_AUTHORITY",
    }),
  ]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`M6A_ASSERTION_FAILED: ${message}`);
  }
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceFromDeterministicFragments(bytes: Buffer) {
  return (async function* () {
    const cut1 = Math.min(1, bytes.length);
    const cut2 = Math.min(4, bytes.length);
    const cut3 = Math.min(11, bytes.length);

    for (const chunk of [
      bytes.subarray(0, cut1),
      bytes.subarray(cut1, cut2),
      bytes.subarray(cut2, cut3),
      bytes.subarray(cut3),
    ]) {
      if (chunk.length > 0) {
        yield chunk;
      }
    }
  })();
}

function buildClassicPdf() {
  const objectBodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ];

  const chunks: Buffer[] = [
    Buffer.from("%PDF-1.7\n%HDS-M6A\n", "latin1"),
  ];

  const offsets: number[] = [0];
  let byteLength = chunks[0]!.length;

  objectBodies.forEach((body, index) => {
    offsets[index + 1] = byteLength;

    const objectBytes = Buffer.from(
      `${index + 1} 0 obj\n${body}\nendobj\n`,
      "latin1",
    );

    chunks.push(objectBytes);
    byteLength += objectBytes.length;
  });

  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objectBodies.length + 1}\n`;
  xref += "0000000000 65535 f \n";

  for (
    let objectNumber = 1;
    objectNumber <= objectBodies.length;
    objectNumber += 1
  ) {
    xref +=
      `${String(offsets[objectNumber]).padStart(10, "0")}` +
      " 00000 n \n";
  }

  xref +=
    `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  chunks.push(Buffer.from(xref, "latin1"));

  return Buffer.concat(chunks);
}

async function inspectPdf(args: {
  bytes: Buffer;
  expectedSizeBytes?: number;
  expectedSha256?: string;
}) {
  return inspectNativeDocumentIdentity({
    source: sourceFromDeterministicFragments(args.bytes),
    expectedSizeBytes:
      args.expectedSizeBytes ?? args.bytes.length,
    expectedSha256:
      args.expectedSha256 ?? sha256(args.bytes),
    declaredFilename: "m6a-sentinel.pdf",
    declaredExtension: "pdf",
    declaredMimeType: "application/pdf",
    limits: {
      maxBytes: ONE_MEBIBYTE,
      pdf: PDF_LIMITS,
    },
  });
}

function assertResultMatchesContract(
  result: NativeDocumentScannerResult,
  contract: CorpusCaseContract,
) {
  assert(
    result.verdict === contract.expectedVerdict,
    `${contract.caseId} expected verdict ${contract.expectedVerdict}, received ${result.verdict}.`,
  );

  assert(
    result.reasonCodes.includes(contract.expectedReasonCode),
    `${contract.caseId} expected reason ${contract.expectedReasonCode}.`,
  );

  assert(
    String(result.verdict) !== "CLEAN",
    `${contract.caseId} must never grant CLEAN authority during M6A.`,
  );

  assert(
    result.inspectionComplete === false,
    `${contract.caseId} must preserve inspectionComplete=false during M6A.`,
  );

  if (contract.expectedRuleId !== null) {
    assert(
      result.rulePackEvaluation?.matchedRules.some(
        (rule) => rule.ruleId === contract.expectedRuleId,
      ) === true,
      `${contract.caseId} expected matched rule ${contract.expectedRuleId}.`,
    );
  }
}

function validateManifest() {
  assert(
    THREAT_FAMILIES.length === 21,
    "M6A must register the exact 21-family adversarial coverage seed.",
  );

  assert(
    THREAT_FAMILY_MANIFEST.length === THREAT_FAMILIES.length,
    "Every registered threat family must have exactly one manifest entry.",
  );

  const expectedFamilies = new Set<string>(THREAT_FAMILIES);
  const observedFamilies = new Set<string>();

  for (const entry of THREAT_FAMILY_MANIFEST) {
    assert(
      Object.isFrozen(entry),
      `Manifest entry ${entry.threatFamily} must be immutable.`,
    );
    assert(
      expectedFamilies.has(entry.threatFamily),
      `Manifest entry ${entry.threatFamily} is not a registered threat family.`,
    );
    assert(
      !observedFamilies.has(entry.threatFamily),
      `Threat family ${entry.threatFamily} is registered more than once.`,
    );
    assert(
      entry.certificationStatus === "NOT_CERTIFIED",
      `M6A must not pre-certify ${entry.threatFamily}.`,
    );
    assert(
      entry.objective.trim().length >= 24,
      `Threat family ${entry.threatFamily} must have an explicit adversarial objective.`,
    );

    observedFamilies.add(entry.threatFamily);
  }

  assert(
    observedFamilies.size === expectedFamilies.size,
    "M6A manifest coverage must be complete and non-duplicated.",
  );

  assert(
    Object.isFrozen(THREAT_FAMILY_MANIFEST),
    "M6A threat-family manifest must be immutable.",
  );
}

function validateCaseContract() {
  const caseIds = new Set<string>();

  for (const testCase of HARNESS_SENTINEL_CASES) {
    assert(
      Object.isFrozen(testCase),
      `Sentinel ${testCase.caseId} must be immutable.`,
    );
    assert(
      /^HDS-M6A-SENTINEL-\d{3}-[A-Z0-9-]+$/.test(testCase.caseId),
      `Sentinel case id is invalid: ${testCase.caseId}`,
    );
    assert(
      !caseIds.has(testCase.caseId),
      `Duplicate sentinel case id: ${testCase.caseId}`,
    );
    assert(
      testCase.provenance === "DETERMINISTIC_GENERATED",
      `${testCase.caseId} must declare deterministic generated provenance.`,
    );
    assert(
      testCase.certificationPhase === "M6A" &&
        testCase.certificationCredit === false,
      `${testCase.caseId} is a harness sentinel and must not earn certification credit.`,
    );
    assert(
      testCase.authorityImplication === "NO_CLEAN_AUTHORITY",
      `${testCase.caseId} must preserve the no-CLEAN authority boundary.`,
    );
    assert(
      testCase.attackTechnique.trim().length >= 24,
      `${testCase.caseId} must describe its attack/control technique.`,
    );

    caseIds.add(testCase.caseId);
  }

  assert(
    Object.isFrozen(HARNESS_SENTINEL_CASES),
    "M6A sentinel case registry must be immutable.",
  );
}

function validateRulePackBoundary() {
  assert(
    HEHXAGON_DOCUMENT_SECURITY_RULE_IDS.length === 21,
    "M6A must remain grounded to the immutable 21-rule M4 ingress rule pack.",
  );

  assert(
    new Set(HEHXAGON_DOCUMENT_SECURITY_RULE_IDS).size ===
      HEHXAGON_DOCUMENT_SECURITY_RULE_IDS.length,
    "M4 rule ids must remain unique.",
  );

  assert(
    HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_VERSION ===
      "HDS-M4-DOCUMENT-INGRESS-RULES-V1",
    "M6A must not silently change the certified M4 rule-pack version.",
  );

  assert(
    HEHXAGON_DOCUMENT_SECURITY_ENGINE ===
      "HEHXAGON_DOCUMENT_SECURITY",
    "M6A must exercise the Hehxagon native document security engine.",
  );

  assert(
    HEHXAGON_DOCUMENT_SECURITY_ENGINE_VERSION ===
      "0.4.0-m4",
    "M6A must remain pinned to the M4 engine while adversarial certification begins.",
  );
}

async function executeSentinels() {
  const safePdf = buildClassicPdf();

  const safeResult = await inspectPdf({
    bytes: safePdf,
  });

  assertResultMatchesContract(
    safeResult,
    HARNESS_SENTINEL_CASES[0]!,
  );

  assert(
    safeResult.pdfStructuralInspectionComplete === true &&
      safeResult.rulePackEvaluationComplete === true &&
      safeResult.rulePackEvaluation?.outcome === "PASS",
    "The safe PDF sentinel must traverse complete PDF structural inspection and the M4 rule pack.",
  );

  const executable = Buffer.from([
    0x4d, 0x5a, 0x90, 0x00,
    0x03, 0x00, 0x00, 0x00,
  ]);

  const executableResult =
    await inspectNativeDocumentIdentity({
      source: sourceFromDeterministicFragments(executable),
      expectedSizeBytes: executable.length,
      expectedSha256: sha256(executable),
      declaredFilename: "m6a-sentinel.pdf",
      declaredExtension: "pdf",
      declaredMimeType: "application/pdf",
      limits: {
        maxBytes: ONE_MEBIBYTE,
        pdf: PDF_LIMITS,
      },
    });

  assertResultMatchesContract(
    executableResult,
    HARNESS_SENTINEL_CASES[1]!,
  );

  const shaMismatchResult = await inspectPdf({
    bytes: safePdf,
    expectedSha256: "0".repeat(64),
  });

  assertResultMatchesContract(
    shaMismatchResult,
    HARNESS_SENTINEL_CASES[2]!,
  );

  const truncatedSizeResult = await inspectPdf({
    bytes: safePdf,
    expectedSizeBytes: safePdf.length + 1,
  });

  assertResultMatchesContract(
    truncatedSizeResult,
    HARNESS_SENTINEL_CASES[3]!,
  );

  const sizeExceededResult = await inspectPdf({
    bytes: safePdf,
    expectedSizeBytes: safePdf.length - 1,
  });

  assertResultMatchesContract(
    sizeExceededResult,
    HARNESS_SENTINEL_CASES[4]!,
  );

  return [
    safeResult,
    executableResult,
    shaMismatchResult,
    truncatedSizeResult,
    sizeExceededResult,
  ] as const;
}

async function run() {
  validateManifest();
  validateCaseContract();
  validateRulePackBoundary();

  const results = await executeSentinels();

  const sentinelSummary =
    HARNESS_SENTINEL_CASES.map((testCase, index) =>
      Object.freeze({
        caseId: testCase.caseId,
        threatFamily: testCase.threatFamily,
        benignControl: testCase.benignControl,
        certificationCredit: testCase.certificationCredit,
        expectedVerdict: testCase.expectedVerdict,
        actualVerdict: results[index]!.verdict,
        expectedReasonCode: testCase.expectedReasonCode,
        reasonMatched:
          results[index]!.reasonCodes.includes(
            testCase.expectedReasonCode,
          ),
      }),
    );

  assert(
    results.every(
      (result) =>
        String(result.verdict) !== "CLEAN" &&
        result.inspectionComplete === false,
    ),
    "M6A execution must never grant CLEAN or completed document-trust authority.",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        event:
          "HDS_M6A_ADVERSARIAL_CORPUS_HARNESS_SELFTEST_PASSED",
        corpusSchemaVersion:
          HDS_M6_ADVERSARIAL_CORPUS_SCHEMA_VERSION,
        harnessVersion:
          HDS_M6A_HARNESS_VERSION,
        scannerEngine:
          HEHXAGON_DOCUMENT_SECURITY_ENGINE,
        scannerEngineVersion:
          HEHXAGON_DOCUMENT_SECURITY_ENGINE_VERSION,
        rulePackVersion:
          HEHXAGON_DOCUMENT_SECURITY_RULE_PACK_VERSION,
        threatFamilyCount:
          THREAT_FAMILY_MANIFEST.length,
        threatFamilies:
          THREAT_FAMILY_MANIFEST.map(
            (entry) => ({
              threatFamily:
                entry.threatFamily,
              plannedPhase:
                entry.plannedPhase,
              certificationStatus:
                entry.certificationStatus,
            }),
          ),
        corpusProvenance:
          "DETERMINISTIC_GENERATED",
        externalBinaryCorpusFiles: 0,
        filesystemExtractionRequired: false,
        networkAccessRequired: false,
        sentinelCaseCount:
          HARNESS_SENTINEL_CASES.length,
        sentinelCertificationCredit: 0,
        sentinelResults:
          sentinelSummary,
        adversarialCertificationComplete: false,
        cleanAuthorityGranted: false,
        immutablePromotionAuthorityGranted: false,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        event:
          "HDS_M6A_ADVERSARIAL_CORPUS_HARNESS_SELFTEST_FAILED",
        errorCode:
          error instanceof Error
            ? error.message
            : "M6A_UNKNOWN_FAILURE",
      },
      null,
      2,
    ),
  );

  process.exitCode = 1;
});
