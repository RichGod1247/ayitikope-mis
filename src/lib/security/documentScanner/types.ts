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
 * M3B1 still deliberately has no CLEAN verdict.
 *
 * IDENTITY_VERIFIED means that byte integrity, broad container identity, and
 * (for OOXML) bounded package identity plus the M3A OOXML and M3B1 classic-PDF structural policies have
 * been established. It is not a sendable or malware-clean state. modern-PDF compressed structures, OLE
 * structural inspection and the later versioned rule pack are still required
 * before any future milestone may earn CLEAN.
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
  | "OOXML_APPLICATION_MISMATCH"
  | "OOXML_STRUCTURAL_POLICY_PASSED_ADDITIONAL_INSPECTION_REQUIRED"
  | "OOXML_RELATIONSHIP_PART_TOO_LARGE"
  | "OOXML_RELATIONSHIP_XML_INVALID"
  | "OOXML_RELATIONSHIP_TARGET_INVALID"
  | "OOXML_VBA_PROJECT_BLOCKED"
  | "OOXML_MACRO_ENABLED_CONTENT_TYPE_BLOCKED"
  | "OOXML_ACTIVEX_BLOCKED"
  | "OOXML_EMBEDDED_OBJECT_BLOCKED"
  | "OOXML_EXTERNAL_RELATIONSHIP_BLOCKED"
  | "OOXML_REMOTE_TEMPLATE_BLOCKED"
  | "OOXML_EXECUTABLE_PACKAGE_PART_BLOCKED"
  | "PDF_LIMITS_REQUIRED"
  | "PDF_HEADER_INVALID"
  | "PDF_STARTXREF_MISSING"
  | "PDF_STARTXREF_INVALID"
  | "PDF_XREF_TABLE_INVALID"
  | "PDF_XREF_STREAM_UNSUPPORTED"
  | "PDF_OBJECT_STREAM_UNSUPPORTED"
  | "PDF_INCREMENTAL_UPDATE_LIMIT_EXCEEDED"
  | "PDF_OBJECT_COUNT_LIMIT_EXCEEDED"
  | "PDF_OBJECT_OFFSET_INVALID"
  | "PDF_OBJECT_SYNTAX_INVALID"
  | "PDF_OBJECT_NESTING_LIMIT_EXCEEDED"
  | "PDF_TOKEN_LIMIT_EXCEEDED"
  | "PDF_STRING_LIMIT_EXCEEDED"
  | "PDF_STREAM_LENGTH_INVALID"
  | "PDF_STREAM_BOUNDARY_INVALID"
  | "PDF_ROOT_CATALOG_MISSING"
  | "PDF_PAGE_TREE_MISSING"
  | "PDF_ENCRYPTED_BLOCKED"
  | "PDF_JAVASCRIPT_BLOCKED"
  | "PDF_OPEN_ACTION_BLOCKED"
  | "PDF_ADDITIONAL_ACTION_BLOCKED"
  | "PDF_LAUNCH_ACTION_BLOCKED"
  | "PDF_EMBEDDED_FILE_BLOCKED"
  | "PDF_RICH_MEDIA_BLOCKED"
  | "PDF_XFA_BLOCKED"
  | "PDF_EXTERNAL_ACTION_BLOCKED"
  | "PDF_UNSAFE_URI_ACTION_BLOCKED"
  | "PDF_STRUCTURAL_POLICY_PASSED_ADDITIONAL_INSPECTION_REQUIRED";

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

export type NativeDocumentPdfLimits = {
  maxObjects: number;
  maxIncrementalUpdates: number;
  maxNestingDepth: number;
  maxTokenBytes: number;
  maxStringBytes: number;
};

export type NativeDocumentScannerLimits = {
  /** Maximum number of compressed/source bytes the scanner may consume. */
  maxBytes: number;

  /** Required for DOCX/XLSX/PPTX beginning with M2. */
  archive?: NativeDocumentArchiveLimits;

  /** Required for PDF beginning with M3B1. */
  pdf?: NativeDocumentPdfLimits;
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

export type NativeDocumentOoxmlStructuralEvidence = {
  relationshipPartsInspected: number;
  relationshipsInspected: number;
  externalHyperlinksObserved: number;

  contentTypePolicyVerified: true;
  relationshipPolicyVerified: true;
  packagePartPolicyVerified: true;

  vbaProjectDetected: false;
  macroEnabledContentTypeDetected: false;
  activeXDetected: false;
  embeddedObjectDetected: false;
  blockedExternalRelationshipDetected: false;
  remoteTemplateDetected: false;
  executablePackagePartDetected: false;
};

export type NativeDocumentPdfStructuralEvidence = {
  pdfVersion: "1.0" | "1.1" | "1.2" | "1.3" | "1.4" | "1.5" | "1.6" | "1.7" | "2.0";
  xrefSections: number;
  activeObjectCount: number;
  incrementalUpdates: number;
  safeUriActionsObserved: number;

  encrypted: false;
  xrefStreamsDetected: false;
  objectStreamsDetected: false;
  catalogVerified: true;
  pageTreeRootVerified: true;

  javascriptDetected: false;
  openActionDetected: false;
  additionalActionDetected: false;
  launchActionDetected: false;
  embeddedFileDetected: false;
  richMediaDetected: false;
  xfaDetected: false;
  blockedExternalActionDetected: false;
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

  /** True only when the M3A OOXML structural policy ran to completion. */
  ooxmlStructuralInspectionComplete: boolean;
  ooxmlStructuralEvidence: NativeDocumentOoxmlStructuralEvidence | null;

  /** True only when the M3B1 classic-PDF structural policy ran to completion. */
  pdfStructuralInspectionComplete: boolean;
  pdfStructuralEvidence: NativeDocumentPdfStructuralEvidence | null;

  /**
   * Always false through M3B1. Modern compressed-PDF structures, legacy OLE
   * structural inspection, and later rule-pack evaluation still remain before
   * full document trust exists.
   */
  inspectionComplete: false;

  identityEvidence: NativeDocumentIdentityEvidence;
};
