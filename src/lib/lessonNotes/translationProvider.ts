import { normalizeEducationalText } from "@/lib/ghanaianLanguages/text";

export const HELSINKI_EWE_PROVIDER = "HELSINKI_NLP" as const;
export const HELSINKI_EWE_MODEL_ID =
  "Helsinki-NLP/opus-mt-en-ee" as const;
export const HELSINKI_EWE_MODEL_REVISION =
  "fef1362558b7948e5257f06f192d700761b3b57d" as const;

const HELSINKI_EWE_SOURCE_LANGUAGE = "en" as const;
const HELSINKI_EWE_TARGET_LANGUAGE = "ee" as const;
const PROVIDER_TIMEOUT_MS = 65_000;
const MIN_PROVIDER_TOKEN_BYTES = 32;
const MAX_MODEL_SEGMENT_CHARS = 50_000;

export type HelsinkiEweTranslationResult = {
  translation: string;
  provider: typeof HELSINKI_EWE_PROVIDER;
  modelId: typeof HELSINKI_EWE_MODEL_ID;
  modelRevision: typeof HELSINKI_EWE_MODEL_REVISION;
  sourceLanguage: typeof HELSINKI_EWE_SOURCE_LANGUAGE;
  targetLanguage: typeof HELSINKI_EWE_TARGET_LANGUAGE;
};

export type TranslationProviderErrorCode =
  | "TRANSLATION_PROVIDER_NOT_CONFIGURED"
  | "TRANSLATION_PROVIDER_INPUT_INVALID"
  | "TRANSLATION_PROVIDER_TIMEOUT"
  | "TRANSLATION_PROVIDER_UNAVAILABLE"
  | "TRANSLATION_PROVIDER_REJECTED"
  | "TRANSLATION_PROVIDER_RESPONSE_INVALID";

export class TranslationProviderError extends Error {
  readonly code: TranslationProviderErrorCode;
  readonly httpStatus: number;

  constructor(
    code: TranslationProviderErrorCode,
    httpStatus: number,
  ) {
    super(code);
    this.name = "TranslationProviderError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

type TranslatorServiceResponse = {
  ok?: unknown;
  translation?: unknown;
  provider?: unknown;
  model?: unknown;
  modelRevision?: unknown;
  sourceLanguage?: unknown;
  targetLanguage?: unknown;
};

function configuredTranslatorEndpoint() {
  const rawBaseUrl =
    String(
      process.env.EDULIFE_TRANSLATOR_BASE_URL ?? "",
    ).trim();

  const providerToken =
    String(
      process.env.EDULIFE_TRANSLATION_PROVIDER_TOKEN ?? "",
    ).trim();

  if (
    !rawBaseUrl ||
    Buffer.byteLength(providerToken, "utf8") <
      MIN_PROVIDER_TOKEN_BYTES
  ) {
    throw new TranslationProviderError(
      "TRANSLATION_PROVIDER_NOT_CONFIGURED",
      503,
    );
  }

  let baseUrl: URL;

  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new TranslationProviderError(
      "TRANSLATION_PROVIDER_NOT_CONFIGURED",
      503,
    );
  }

  const isExactPilotLoopback =
    baseUrl.protocol === "http:" &&
    baseUrl.hostname === "127.0.0.1" &&
    baseUrl.port === "8787" &&
    (baseUrl.pathname === "/" || baseUrl.pathname === "") &&
    !baseUrl.username &&
    !baseUrl.password &&
    !baseUrl.search &&
    !baseUrl.hash;

  if (!isExactPilotLoopback) {
    throw new TranslationProviderError(
      "TRANSLATION_PROVIDER_NOT_CONFIGURED",
      503,
    );
  }

  return {
    translateUrl: new URL(
      "/translate",
      baseUrl,
    ).toString(),
    providerToken,
  };
}

function normalizedModelSegment(value: unknown) {
  const text = normalizeEducationalText(value);

  if (
    !text.trim() ||
    text.length > MAX_MODEL_SEGMENT_CHARS
  ) {
    throw new TranslationProviderError(
      "TRANSLATION_PROVIDER_INPUT_INVALID",
      400,
    );
  }

  return text;
}

function validServiceResponse(
  payload: TranslatorServiceResponse,
): payload is TranslatorServiceResponse & {
  ok: true;
  translation: string;
  provider: typeof HELSINKI_EWE_PROVIDER;
  model: typeof HELSINKI_EWE_MODEL_ID;
  modelRevision: typeof HELSINKI_EWE_MODEL_REVISION;
  sourceLanguage: typeof HELSINKI_EWE_SOURCE_LANGUAGE;
  targetLanguage: typeof HELSINKI_EWE_TARGET_LANGUAGE;
} {
  return (
    payload.ok === true &&
    typeof payload.translation === "string" &&
    Boolean(payload.translation.trim()) &&
    payload.provider === HELSINKI_EWE_PROVIDER &&
    payload.model === HELSINKI_EWE_MODEL_ID &&
    payload.modelRevision === HELSINKI_EWE_MODEL_REVISION &&
    payload.sourceLanguage === HELSINKI_EWE_SOURCE_LANGUAGE &&
    payload.targetLanguage === HELSINKI_EWE_TARGET_LANGUAGE
  );
}

export async function translateModelSegmentToEwe(
  value: unknown,
): Promise<HelsinkiEweTranslationResult> {
  const text = normalizedModelSegment(value);
  const { translateUrl, providerToken } =
    configuredTranslatorEndpoint();

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PROVIDER_TIMEOUT_MS,
  );

  let response: Response;

  try {
    response = await fetch(translateUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerToken}`,
      },
      body: JSON.stringify({ text }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new TranslationProviderError(
        "TRANSLATION_PROVIDER_TIMEOUT",
        504,
      );
    }

    throw new TranslationProviderError(
      "TRANSLATION_PROVIDER_UNAVAILABLE",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }

  let payload: TranslatorServiceResponse | null =
    null;

  try {
    payload =
      (await response.json()) as TranslatorServiceResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new TranslationProviderError(
      response.status === 422
        ? "TRANSLATION_PROVIDER_REJECTED"
        : "TRANSLATION_PROVIDER_UNAVAILABLE",
      response.status === 422 ? 502 : 502,
    );
  }

  if (
    !payload ||
    !validServiceResponse(payload)
  ) {
    throw new TranslationProviderError(
      "TRANSLATION_PROVIDER_RESPONSE_INVALID",
      502,
    );
  }

  return {
    translation: normalizeEducationalText(
      payload.translation,
    ),
    provider: HELSINKI_EWE_PROVIDER,
    modelId: HELSINKI_EWE_MODEL_ID,
    modelRevision: HELSINKI_EWE_MODEL_REVISION,
    sourceLanguage: HELSINKI_EWE_SOURCE_LANGUAGE,
    targetLanguage: HELSINKI_EWE_TARGET_LANGUAGE,
  };
}
