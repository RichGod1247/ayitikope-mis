import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import {
  GHANAIAN_LANGUAGE_REGISTRY_VERSION,
  getGhanaianLanguage,
  type GhanaianLanguageCode,
} from "@/lib/ghanaianLanguages/registry";
import {
  TRANSLATION_NORMALIZATION_VERSION,
  TRANSLATION_PROTECTED_TOKEN_VERSION,
  TRANSLATION_RECEIPT_VERSION,
  isSha256Hex,
  isTranslatableLessonField,
  isTranslationSuggestionSource,
  type TranslatableLessonField,
  type TranslationSuggestionSource,
} from "@/lib/lessonNotes/translationContract";

const RECEIPT_SCOPE = "EDULIFE_TRANSLATION_RECEIPT" as const;
const DEFAULT_RECEIPT_TTL_SECONDS = 12 * 60 * 60;
const MAX_RECEIPT_TTL_SECONDS = 24 * 60 * 60;
const FUTURE_CLOCK_SKEW_SECONDS = 5 * 60;

export type TranslationReceiptPayloadV1 = {
  v: 1;
  scope: typeof RECEIPT_SCOPE;
  receiptVersion: typeof TRANSLATION_RECEIPT_VERSION;
  receiptId: string;
  tenantId: string;
  teacherUserId: string;
  lessonNoteId: string;
  field: TranslatableLessonField;
  sourceLanguage: "en";
  languageCode: GhanaianLanguageCode;
  registryVersion: typeof GHANAIAN_LANGUAGE_REGISTRY_VERSION;
  normalizationVersion: typeof TRANSLATION_NORMALIZATION_VERSION;
  protectedTokenVersion: typeof TRANSLATION_PROTECTED_TOKEN_VERSION;
  sourceHash: string;
  suggestionSource: TranslationSuggestionSource;
  provider: string | null;
  modelId: string | null;
  modelRevision: string | null;
  suggestedHash: string;
  iat: number;
  exp: number;
};

type SignTranslationReceiptInput = Omit<
  TranslationReceiptPayloadV1,
  | "v"
  | "scope"
  | "receiptVersion"
  | "receiptId"
  | "sourceLanguage"
  | "normalizationVersion"
  | "protectedTokenVersion"
  | "iat"
  | "exp"
> & {
  ttlSeconds?: number;
  now?: Date;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function getReceiptSecret() {
  const secret = clean(process.env.TRANSLATION_RECEIPT_SECRET);

  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(
      "TRANSLATION_RECEIPT_SECRET must be configured server-side with at least 32 UTF-8 bytes.",
    );
  }

  return secret;
}

function base64urlEncode(input: Buffer) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("TRANSLATION_RECEIPT_BASE64URL_INVALID");
  }

  const pad =
    value.length % 4 === 0
      ? ""
      : "=".repeat(4 - (value.length % 4));

  return Buffer.from(
    value.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64",
  );
}

function signature(payloadB64: string) {
  return base64urlEncode(
    createHmac("sha256", getReceiptSecret())
      .update(`${TRANSLATION_RECEIPT_VERSION}|${payloadB64}`, "utf8")
      .digest(),
  );
}

function isUuid(value: unknown) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function validIdentity(value: unknown, max = 160) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= max
  );
}

function validProvenance(payload: {
  suggestionSource?: unknown;
  provider?: unknown;
  modelId?: unknown;
  modelRevision?: unknown;
}) {
  if (!isTranslationSuggestionSource(payload.suggestionSource)) {
    return false;
  }

  if (payload.suggestionSource === "MODEL") {
    return (
      validIdentity(payload.provider, 80) &&
      validIdentity(payload.modelId, 180) &&
      validIdentity(payload.modelRevision, 180)
    );
  }

  return (
    payload.provider === null &&
    payload.modelId === null &&
    payload.modelRevision === null
  );
}

function payloadIsValid(
  value: unknown,
  nowSeconds: number,
): value is TranslationReceiptPayloadV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const payload = value as Partial<TranslationReceiptPayloadV1>;

  return (
    payload.v === 1 &&
    payload.scope === RECEIPT_SCOPE &&
    payload.receiptVersion === TRANSLATION_RECEIPT_VERSION &&
    isUuid(payload.receiptId) &&
    validIdentity(payload.tenantId) &&
    validIdentity(payload.teacherUserId) &&
    validIdentity(payload.lessonNoteId) &&
    isTranslatableLessonField(payload.field) &&
    payload.sourceLanguage === "en" &&
    typeof payload.languageCode === "string" &&
    Boolean(getGhanaianLanguage(payload.languageCode)) &&
    payload.registryVersion === GHANAIAN_LANGUAGE_REGISTRY_VERSION &&
    payload.normalizationVersion === TRANSLATION_NORMALIZATION_VERSION &&
    payload.protectedTokenVersion === TRANSLATION_PROTECTED_TOKEN_VERSION &&
    isSha256Hex(payload.sourceHash) &&
    isSha256Hex(payload.suggestedHash) &&
    validProvenance(payload) &&
    typeof payload.iat === "number" &&
    Number.isFinite(payload.iat) &&
    typeof payload.exp === "number" &&
    Number.isFinite(payload.exp) &&
    payload.iat <= nowSeconds + FUTURE_CLOCK_SKEW_SECONDS &&
    payload.exp > nowSeconds &&
    payload.exp > payload.iat &&
    payload.exp - payload.iat <= MAX_RECEIPT_TTL_SECONDS
  );
}

export function signTranslationReceipt(
  input: SignTranslationReceiptInput,
) {
  const tenantId = clean(input.tenantId);
  const teacherUserId = clean(input.teacherUserId);
  const lessonNoteId = clean(input.lessonNoteId);

  if (
    !validIdentity(tenantId) ||
    !validIdentity(teacherUserId) ||
    !validIdentity(lessonNoteId) ||
    !isTranslatableLessonField(input.field) ||
    !isSha256Hex(input.sourceHash) ||
    !isSha256Hex(input.suggestedHash) ||
    !getGhanaianLanguage(input.languageCode) ||
    input.registryVersion !== GHANAIAN_LANGUAGE_REGISTRY_VERSION ||
    !validProvenance(input)
  ) {
    throw new Error("TRANSLATION_RECEIPT_INPUT_INVALID");
  }

  const now = input.now ? new Date(input.now) : new Date();

  if (Number.isNaN(now.getTime())) {
    throw new Error("TRANSLATION_RECEIPT_TIME_INVALID");
  }

  const requestedTtl =
    Number(input.ttlSeconds ?? DEFAULT_RECEIPT_TTL_SECONDS) ||
    DEFAULT_RECEIPT_TTL_SECONDS;

  const ttlSeconds = Math.min(
    Math.max(Math.floor(requestedTtl), 60),
    MAX_RECEIPT_TTL_SECONDS,
  );

  const iat = Math.floor(now.getTime() / 1000);

  const payload: TranslationReceiptPayloadV1 = {
    v: 1,
    scope: RECEIPT_SCOPE,
    receiptVersion: TRANSLATION_RECEIPT_VERSION,
    receiptId: randomUUID(),
    tenantId,
    teacherUserId,
    lessonNoteId,
    field: input.field,
    sourceLanguage: "en",
    languageCode: input.languageCode,
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    normalizationVersion: TRANSLATION_NORMALIZATION_VERSION,
    protectedTokenVersion: TRANSLATION_PROTECTED_TOKEN_VERSION,
    sourceHash: input.sourceHash,
    suggestionSource: input.suggestionSource,
    provider:
      input.provider === null ? null : clean(input.provider),
    modelId:
      input.modelId === null ? null : clean(input.modelId),
    modelRevision:
      input.modelRevision === null
        ? null
        : clean(input.modelRevision),
    suggestedHash: input.suggestedHash,
    iat,
    exp: iat + ttlSeconds,
  };

  const payloadB64 = base64urlEncode(
    Buffer.from(JSON.stringify(payload), "utf8"),
  );

  return {
    receipt: `${payloadB64}.${signature(payloadB64)}`,
    payload,
  };
}

export function verifyTranslationReceipt(
  token: unknown,
  options?: {
    now?: Date;
  },
): TranslationReceiptPayloadV1 | null {
  const raw = clean(token);
  const parts = raw.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64, signatureB64] = parts;

  if (!payloadB64 || !signatureB64) {
    return null;
  }

  let actualSignature: Buffer;
  let expectedSignature: Buffer;

  try {
    actualSignature = Buffer.from(signatureB64, "utf8");
    expectedSignature = Buffer.from(signature(payloadB64), "utf8");
  } catch {
    return null;
  }

  if (actualSignature.length !== expectedSignature.length) {
    return null;
  }

  if (!timingSafeEqual(actualSignature, expectedSignature)) {
    return null;
  }

  let payload: unknown;

  try {
    payload = JSON.parse(
      base64urlDecode(payloadB64).toString("utf8"),
    );
  } catch {
    return null;
  }

  const now = options?.now ? new Date(options.now) : new Date();

  if (Number.isNaN(now.getTime())) {
    return null;
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);

  return payloadIsValid(payload, nowSeconds)
    ? payload
    : null;
}
