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
  | "WORD_OOXML"
  | "POWERPOINT_OOXML"
  | "EXCEL_OOXML"
  | "OLE_COMPOUND_FILE"
  | "UNKNOWN";

/**
 * M2 still deliberately has no CLEAN verdict.
 *
 * IDENTITY_VERIFIED means that byte integrity, broad container identity, and
 * (for OOXML) bounded package identity have been established. It is not a
 * sendable or malware-clean state. M3 format-specific security inspection is
 * still required before a later milestone may earn CLEAN.
 */
export type NativeDocumentScannerVerdict =
  | "IDENTITY_VERIFIED"
  | "BLOCKED"
  | "FAILED";

export type NativeDocumentScannerReasonCode =
  | "IDENTITY_VERIFIED_DEEP_INSPECTION_REQUIRED"
  | "OOXML_PACKAGE_IDENTITY_VERIFIED_DEEP_INSPECTION_REQUIRED"
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
  | "EXTENSION_CONTAINER_MISMATCH"
  | "OOXML_ARCHIVE_LIMITS_REQUIRED"
  | "ZIP_END_OF_CENTRAL_DIRECTORY_MISSING"
  | "ZIP_MULTI_DISK_UNSUPPORTED"
  | "ZIP64_UNSUPPORTED"
  | "ZIP_CENTRAL_DIRECTORY_INVALID"
  | "ZIP_ENTRY_COUNT_LIMIT_EXCEEDED"
  | "ZIP_ENTRY_NAME_ENCODING_UNSUPPORTED"
  | "ZIP_ENTRY_PATH_INVALID"
  | "ZIP_ENTRY_PATH_TRAVERSAL"
  | "ZIP_ENTRY_ABSOLUTE_PATH"
  | "ZIP_DUPLICATE_ENTRY"
  | "ZIP_ENTRY_ENCRYPTED"
  | "ZIP_COMPRESSION_METHOD_UNSUPPORTED"
  | "ZIP_ENTRY_SIZE_LIMIT_EXCEEDED"
  | "ZIP_TOTAL_EXPANDED_SIZE_LIMIT_EXCEEDED"
  | "ZIP_COMPRESSION_RATIO_LIMIT_EXCEEDED"
  | "ZIP_LOCAL_HEADER_INVALID"
  | "ZIP_ENTRY_DATA_OVERLAP"
  | "OOXML_CONTENT_TYPES_MISSING"
  | "OOXML_ROOT_RELATIONSHIPS_MISSING"
  | "OOXML_CONTROL_PART_TOO_LARGE"
  | "OOXML_CONTROL_PART_DECOMPRESSION_FAILED"
  | "OOXML_CONTROL_PART_SIZE_MISMATCH"
  | "OOXML_CONTROL_PART_CRC_MISMATCH"
  | "OOXML_CONTROL_XML_INVALID"
  | "OOXML_MAIN_DOCUMENT_RELATIONSHIP_MISSING"
  | "OOXML_MAIN_DOCUMENT_RELATIONSHIP_AMBIGUOUS"
  | "OOXML_MAIN_DOCUMENT_RELATIONSHIP_EXTERNAL"
  | "OOXML_MAIN_DOCUMENT_PART_MISSING"
  | "OOXML_MAIN_DOCUMENT_CONTENT_TYPE_MISMATCH"
  | "OOXML_APPLICATION_MISMATCH";

export type NativeDocumentScannerFinding = {
  code: NativeDocumentScannerReasonCode;
  severity: "INFO" | "BLOCK" | "ERROR";
  message: string;
};

/**
 * M2 archive limits are caller-supplied policy, not hidden parser defaults.
 * The scanner therefore cannot silently widen decompression/resource limits.
 */
export type NativeDocumentArchiveLimits = {
  maxEntries: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
  maxCompressionRatio: number;
  maxControlPartBytes: number;
};

export type NativeDocumentScannerLimits = {
  /** Maximum number of compressed/source bytes the scanner may consume. */
  maxBytes: number;

  /** Required for DOCX/XLSX/PPTX beginning with M2. */
  archive?: NativeDocumentArchiveLimits;
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

export type NativeDocumentArchiveEvidence = {
  entryCount: number;
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  totalCompressedBytes: number;
  totalUncompressedBytes: number;

  packageFormat:
    | "WORD_OOXML"
    | "POWERPOINT_OOXML"
    | "EXCEL_OOXML";
  mainPartPath:
    | "word/document.xml"
    | "ppt/presentation.xml"
    | "xl/workbook.xml";

  contentTypesPartVerified: true;
  rootRelationshipsPartVerified: true;
  mainPartPresent: true;

  zip64: false;
  multiDisk: false;
  encryptedEntriesDetected: false;
  duplicatePathsDetected: false;
  pathTraversalDetected: false;
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
  archiveInspectionComplete: boolean;
  archiveEvidence: NativeDocumentArchiveEvidence | null;

  /**
   * Always false through M2. Full document security inspection does not exist
   * until format-specific structural/security milestones are implemented.
   */
  inspectionComplete: false;

  identityEvidence: NativeDocumentIdentityEvidence;
};
