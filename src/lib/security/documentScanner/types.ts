export type NativeDocumentByteSource =
  | AsyncIterable<Uint8Array>
  | Iterable<Uint8Array>;

export type NativeDocumentExtension =
  | "pdf"
  | "doc"
  | "docx"
  | "ppt"
  | "pptx"
  | "xls"
  | "xlsx";

export type NativeDocumentContainer =
  | "PDF"
  | "ZIP"
  | "OLE"
  | "EXECUTABLE"
  | "UNKNOWN";

export type NativeDocumentFormat =
  | "PDF"
  | "ZIP_CONTAINER"
  | "OLE_COMPOUND_FILE"
  | "UNKNOWN";

/**
 * M1 deliberately has no CLEAN verdict.
 *
 * IDENTITY_VERIFIED means only that byte count, SHA-256, declared metadata,
 * and broad container identity agree as far as M1 can prove. It is not a
 * sendable or malware-clean state. Deeper M2/M3 inspection is still required.
 */
export type NativeDocumentScannerVerdict =
  | "IDENTITY_VERIFIED"
  | "BLOCKED"
  | "FAILED";

export type NativeDocumentScannerReasonCode =
  | "IDENTITY_VERIFIED_DEEP_INSPECTION_REQUIRED"
  | "SCANNER_INPUT_INVALID"
  | "FILENAME_INVALID"
  | "FILENAME_EXTENSION_MISMATCH"
  | "UNSUPPORTED_EXTENSION"
  | "DECLARED_MIME_TYPE_MISMATCH"
  | "EMPTY_SOURCE"
  | "SOURCE_CHUNK_INVALID"
  | "SOURCE_READ_FAILED"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "SIZE_EXCEEDS_EXPECTED"
  | "SIZE_MISMATCH"
  | "SHA256_MISMATCH"
  | "EXECUTABLE_SIGNATURE_DETECTED"
  | "BINARY_SIGNATURE_UNSUPPORTED"
  | "EXTENSION_CONTAINER_MISMATCH";

export type NativeDocumentScannerFinding = {
  code: NativeDocumentScannerReasonCode;
  severity: "INFO" | "BLOCK" | "ERROR";
  message: string;
};

export type NativeDocumentScannerLimits = {
  /** Maximum number of source bytes M1 is allowed to consume. */
  maxBytes: number;
};

export type NativeDocumentScannerInput = {
  source: NativeDocumentByteSource;
  expectedSizeBytes: number;
  expectedSha256: string;
  declaredFilename: string;
  declaredExtension: string;
  declaredMimeType: string;
  limits: NativeDocumentScannerLimits;
};

export type NativeDocumentIdentityEvidence = {
  filenameExtension: string | null;
  declaredExtension: string | null;
  declaredMimeType: string | null;
  detectedContainer: NativeDocumentContainer;
  detectedFormat: NativeDocumentFormat;
  signatureKind:
    | "PDF_HEADER"
    | "ZIP_SIGNATURE"
    | "OLE_COMPOUND_FILE_SIGNATURE"
    | "PE_EXECUTABLE_SIGNATURE"
    | "ELF_EXECUTABLE_SIGNATURE"
    | "UNKNOWN";
  sizeMatched: boolean;
  sha256Matched: boolean;
};

export type NativeDocumentScannerResult = {
  engine: "HEHXAGON_DOCUMENT_SECURITY";
  engineVersion: string;
  rulePackVersion: string;

  verdict: NativeDocumentScannerVerdict;
  reasonCodes: NativeDocumentScannerReasonCode[];
  findings: NativeDocumentScannerFinding[];

  bytesScanned: number;
  sha256Hash: string | null;

  identityInspectionComplete: boolean;

  /**
   * Always false in M1. Full document security inspection does not exist until
   * the bounded archive and format-specific inspection milestones are added.
   */
  inspectionComplete: false;

  identityEvidence: NativeDocumentIdentityEvidence;
};
