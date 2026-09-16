import {
  NextRequest,
  NextResponse,
} from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";
import {
  GHANAIAN_LANGUAGE_REGISTRY_VERSION,
  isGhanaianLanguageSubject,
} from "@/lib/ghanaianLanguages/registry";
import {
  hashTranslationText,
  isTranslatableLessonField,
  resolveTranslationLanguage,
  validateTranslationText,
  type TranslatableLessonField,
} from "@/lib/lessonNotes/translationContract";
import {
  assembleProtectedTranslationBypass,
  createProtectedTranslationBypassPlan,
  getProtectedTranslationModelInputs,
} from "@/lib/lessonNotes/protectedTranslationTokens";
import {
  HELSINKI_EWE_MODEL_ID,
  HELSINKI_EWE_MODEL_REVISION,
  HELSINKI_EWE_PROVIDER,
  TranslationProviderError,
  translateModelSegmentToEwe,
} from "@/lib/lessonNotes/translationProvider";
import {
  signTranslationReceipt,
} from "@/lib/lessonNotes/translationReceipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BODY_BYTES = 256 * 1024;
const RATE_LIMIT_SCOPE =
  "TEACHER_LESSON_NOTE_TRANSLATE_V1";
const RATE_LIMIT_REQUESTS = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_BLOCK_SECONDS = 5 * 60;

const EXACT_BODY_KEYS = [
  "field",
  "lessonNoteId",
  "sourceText",
] as const;

type TranslateBody = {
  lessonNoteId: string;
  field: TranslatableLessonField;
  sourceText: string;
};

function jsonNoStore(
  payload: unknown,
  init?: Parameters<typeof NextResponse.json>[1],
) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function hasExactBodyKeys(
  value: Record<string, unknown>,
) {
  const keys = Object.keys(value).sort();

  return (
    keys.length === EXACT_BODY_KEYS.length &&
    EXACT_BODY_KEYS.every(
      (key, index) => keys[index] === key,
    )
  );
}

function isPlausibleId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 5 &&
    value.trim().length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(value.trim())
  );
}

function normalizedStatus(value: unknown) {
  return String(value ?? "DRAFT")
    .trim()
    .toUpperCase();
}

export async function GET() {
  return jsonNoStore(
    {
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    },
  );
}

export async function PUT() {
  return GET();
}

export async function DELETE() {
  return GET();
}

export async function POST(
  req: NextRequest,
) {
  let ctx: {
    userId: string;
    tenantId: string;
  };

  try {
    const current =
      await requireServerUserContext({
        redirectTo: "/teacher/lesson-notes",
        requireTenant: true,
      });

    ctx = {
      userId: current.userId,
      tenantId: current.tenantId,
    };
  } catch {
    return jsonNoStore(
      {
        ok: false,
        error: "UNAUTHORIZED",
      },
      {
        status: 401,
      },
    );
  }

  const membership =
    await prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: ctx.userId,
          tenantId: ctx.tenantId,
        },
      },
      select: {
        status: true,
      },
    });

  if (
    !membership ||
    membership.status !== "ACTIVE"
  ) {
    return jsonNoStore(
      {
        ok: false,
        error: "MEMBERSHIP_INACTIVE",
      },
      {
        status: 403,
      },
    );
  }

  const contentLength = Number(
    req.headers.get("content-length") ?? "0",
  );

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_REQUEST_BODY_BYTES
  ) {
    return jsonNoStore(
      {
        ok: false,
        error: "REQUEST_TOO_LARGE",
      },
      {
        status: 413,
      },
    );
  }

  const contentType =
    req.headers.get("content-type") ?? "";

  if (
    !contentType
      .toLowerCase()
      .includes("application/json")
  ) {
    return jsonNoStore(
      {
        ok: false,
        error: "JSON_REQUIRED",
      },
      {
        status: 415,
      },
    );
  }

  const rawBody =
    (await req.json().catch(
      () => null,
    )) as unknown;

  if (
    !isRecord(rawBody) ||
    !hasExactBodyKeys(rawBody)
  ) {
    return jsonNoStore(
      {
        ok: false,
        error: "INVALID_REQUEST_SHAPE",
      },
      {
        status: 400,
      },
    );
  }

  if (!isPlausibleId(rawBody.lessonNoteId)) {
    return jsonNoStore(
      {
        ok: false,
        error: "INVALID_LESSON_NOTE_ID",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !isTranslatableLessonField(
      rawBody.field,
    )
  ) {
    return jsonNoStore(
      {
        ok: false,
        error: "TRANSLATION_FIELD_NOT_ALLOWED",
      },
      {
        status: 400,
      },
    );
  }

  const sourceValidation =
    validateTranslationText(
      rawBody.sourceText,
    );

  if (!sourceValidation.ok) {
    return jsonNoStore(
      {
        ok: false,
        error: sourceValidation.error,
      },
      {
        status:
          sourceValidation.error ===
          "TRANSLATION_TEXT_TOO_LARGE"
            ? 413
            : 400,
      },
    );
  }

  const body: TranslateBody = {
    lessonNoteId:
      rawBody.lessonNoteId.trim(),
    field: rawBody.field,
    sourceText: sourceValidation.text,
  };

  const rateLimit =
    await checkRateLimit({
      scope: RATE_LIMIT_SCOPE,
      keyParts: [
        ctx.tenantId,
        ctx.userId,
        getClientIp(req),
      ],
      limit: RATE_LIMIT_REQUESTS,
      windowSeconds:
        RATE_LIMIT_WINDOW_SECONDS,
      blockSeconds:
        RATE_LIMIT_BLOCK_SECONDS,
      metadata: {
        purpose:
          "TEACHER_LESSON_NOTE_TRANSLATE",
      },
    });

  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const note =
    await prisma.lessonNote.findFirst({
      where: {
        id: body.lessonNoteId,
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId,
      },
      select: {
        id: true,
        subject: true,
        status: true,
        lessonLanguageCode: true,
        languageRegistryVersion: true,
      },
    });

  if (!note) {
    return jsonNoStore(
      {
        ok: false,
        error: "LESSON_NOTE_NOT_FOUND",
      },
      {
        status: 404,
      },
    );
  }

  const status =
    normalizedStatus(note.status);

  if (
    status === "SUBMITTED" ||
    status === "APPROVED"
  ) {
    return jsonNoStore(
      {
        ok: false,
        error:
          "LESSON_NOTE_TRANSLATION_LOCKED",
      },
      {
        status: 409,
      },
    );
  }

  if (
    !isGhanaianLanguageSubject(
      note.subject,
    )
  ) {
    return jsonNoStore(
      {
        ok: false,
        error:
          "TRANSLATION_LANGUAGE_NOT_FROZEN",
      },
      {
        status: 409,
      },
    );
  }

  const language =
    resolveTranslationLanguage(
      note.lessonLanguageCode,
      note.languageRegistryVersion,
    );

  if (!language.ok) {
    return jsonNoStore(
      {
        ok: false,
        error: language.error,
      },
      {
        status: 409,
      },
    );
  }

  if (
    language.registryVersion !==
    GHANAIAN_LANGUAGE_REGISTRY_VERSION
  ) {
    return jsonNoStore(
      {
        ok: false,
        error:
          "TRANSLATION_LANGUAGE_REGISTRY_MISMATCH",
      },
      {
        status: 409,
      },
    );
  }

  if (language.languageCode !== "EWE") {
    return jsonNoStore(
      {
        ok: false,
        error:
          "TRANSLATION_ENGINE_NOT_AVAILABLE",
        languageCode:
          language.languageCode,
      },
      {
        status: 409,
      },
    );
  }

  const plan =
    createProtectedTranslationBypassPlan(
      body.sourceText,
    );

  const modelInputs =
    getProtectedTranslationModelInputs(
      plan,
    );

  const translatedSegments: string[] = [];

  let providerMetadata: {
    provider: typeof HELSINKI_EWE_PROVIDER;
    modelId: typeof HELSINKI_EWE_MODEL_ID;
    modelRevision: typeof HELSINKI_EWE_MODEL_REVISION;
  } | null = null;

  try {
    for (const modelInput of modelInputs) {
      const result =
        await translateModelSegmentToEwe(
          modelInput,
        );

      translatedSegments.push(
        result.translation,
      );

      providerMetadata = {
        provider: result.provider,
        modelId: result.modelId,
        modelRevision:
          result.modelRevision,
      };
    }
  } catch (error) {
    if (
      error instanceof
      TranslationProviderError
    ) {
      return jsonNoStore(
        {
          ok: false,
          error: error.code,
        },
        {
          status: error.httpStatus,
        },
      );
    }

    return jsonNoStore(
      {
        ok: false,
        error:
          "TRANSLATION_PROVIDER_UNAVAILABLE",
      },
      {
        status: 502,
      },
    );
  }

  const suggestion =
    assembleProtectedTranslationBypass(
      plan,
      translatedSegments,
    );

  const sourceHash =
    hashTranslationText(
      body.sourceText,
    );

  const suggestedHash =
    hashTranslationText(
      suggestion,
    );

  const provenance =
    providerMetadata ?? {
      provider: HELSINKI_EWE_PROVIDER,
      modelId: HELSINKI_EWE_MODEL_ID,
      modelRevision:
        HELSINKI_EWE_MODEL_REVISION,
    };

  let signed: ReturnType<
    typeof signTranslationReceipt
  >;

  try {
    signed =
      signTranslationReceipt({
        tenantId: ctx.tenantId,
        teacherUserId: ctx.userId,
        lessonNoteId: note.id,
        field: body.field,
        languageCode:
          language.languageCode,
        registryVersion:
          language.registryVersion,
        sourceHash,
        suggestionSource: "MODEL",
        provider:
          provenance.provider,
        modelId:
          provenance.modelId,
        modelRevision:
          provenance.modelRevision,
        suggestedHash,
      });
  } catch {
    return jsonNoStore(
      {
        ok: false,
        error:
          "TRANSLATION_RECEIPT_UNAVAILABLE",
      },
      {
        status: 503,
      },
    );
  }

  return jsonNoStore(
    {
      ok: true,
      field: body.field,
      language: {
        code: language.languageCode,
        name: language.languageName,
        registryVersion:
          language.registryVersion,
      },
      suggestion,
      receipt: signed.receipt,
      receiptExpiresAt:
        new Date(
          signed.payload.exp * 1000,
        ).toISOString(),
      provenance: {
        suggestionSource: "MODEL",
        provider: provenance.provider,
        modelId: provenance.modelId,
        modelRevision:
          provenance.modelRevision,
      },
      protectedValues: {
        count:
          plan.protectedTokenCount,
      },
    },
    {
      status: 200,
    },
  );
}
