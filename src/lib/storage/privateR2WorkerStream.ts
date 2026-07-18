// src/lib/storage/privateR2WorkerStream.ts

import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const ABSOLUTE_MAX_STREAM_BYTES =
  64 * 1024 * 1024;

let cachedClient: S3Client | null = null;

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
};

type R2StreamingBody =
  AsyncIterable<Uint8Array> & {
    destroy?: (error?: Error) => void;
  };

export class PrivateR2WorkerStreamError
  extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PrivateR2WorkerStreamError";
    this.code = code;
  }
}

export type PrivateR2WorkerObjectStream = {
  key: string;
  contentLength: number | null;
  contentType: string | null;
  etag: string | null;
  lastModified: Date | null;
  stream: AsyncIterable<Uint8Array>;
};

export type PrivateR2WorkerPromotionResult = {
  sourceKey: string;
  destinationKey: string;
  sourceEtag: string;
  destinationEtag: string;
  contentLength: number;
  contentType: string;
  sha256Hash: string;
  lastModified: Date | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function requiredEnv(name: string) {
  const value = clean(process.env[name]);

  if (!value) {
    throw new PrivateR2WorkerStreamError(
      "R2_CONFIGURATION_MISSING",
      `Missing required private R2 environment variable: ${name}`,
    );
  }

  return value;
}

function config(): R2Config {
  const accountId = requiredEnv(
    "R2_PRIVATE_ACCOUNT_ID",
  );

  const accessKeyId = requiredEnv(
    "R2_PRIVATE_ACCESS_KEY_ID",
  );

  const secretAccessKey = requiredEnv(
    "R2_PRIVATE_SECRET_ACCESS_KEY",
  );

  const bucketName = requiredEnv(
    "R2_PRIVATE_BUCKET_NAME",
  );

  const configuredEndpoint = clean(
    process.env.R2_PRIVATE_ENDPOINT,
  );

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint: (
      configuredEndpoint ||
      `https://${accountId}.r2.cloudflarestorage.com`
    ).replace(/\/+$/, ""),
  };
}

function client() {
  if (cachedClient) return cachedClient;

  const current = config();

  cachedClient = new S3Client({
    region: "auto",
    endpoint: current.endpoint,
    credentials: {
      accessKeyId: current.accessKeyId,
      secretAccessKey:
        current.secretAccessKey,
    },
  });

  return cachedClient;
}

function safeObjectKey(value: unknown) {
  const key = clean(value).replace(/\\/g, "/");

  if (
    !key ||
    key.startsWith("/") ||
    key.endsWith("/") ||
    key.includes("..") ||
    key.includes("//")
  ) {
    throw new PrivateR2WorkerStreamError(
      "R2_OBJECT_KEY_INVALID",
      "Private R2 object key is invalid.",
    );
  }

  return key;
}

function normalizePositiveInteger(
  value: unknown,
  code: string,
  label: string,
) {
  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    throw new PrivateR2WorkerStreamError(
      code,
      `${label} must be a positive safe integer.`,
    );
  }

  return number;
}

function normalizeEtag(
  value: unknown,
): string | null {
  const normalized = clean(value)
    .replace(/^W\//i, "")
    .replace(/^"+|"+$/g, "");

  return normalized || null;
}

function quotedIfMatchEtag(etag: string) {
  return `"${etag.replace(/"/g, "")}"`;
}

function requiredEtag(
  value: unknown,
  code: string,
) {
  const etag = normalizeEtag(value);

  if (!etag) {
    throw new PrivateR2WorkerStreamError(
      code,
      "Required private R2 ETag is missing.",
    );
  }

  return etag;
}

function requiredSha256(value: unknown) {
  const hash = clean(value).toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new PrivateR2WorkerStreamError(
      "R2_SHA256_INVALID",
      "Verified SHA-256 hash is invalid.",
    );
  }

  return hash;
}

function requiredContentType(value: unknown) {
  const contentType =
    clean(value)
      .toLowerCase()
      .split(";")[0]
      ?.trim() ?? "";

  if (
    !contentType ||
    contentType.length > 255 ||
    !/^[\x20-\x7e]+$/.test(contentType)
  ) {
    throw new PrivateR2WorkerStreamError(
      "R2_CONTENT_TYPE_INVALID",
      "Verified content type is invalid.",
    );
  }

  return contentType;
}

function encodedCopySource(
  bucketName: string,
  sourceKey: string,
) {
  return [
    bucketName,
    ...sourceKey.split("/"),
  ]
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function normalizedMetadata(
  value:
    | Record<string, string>
    | undefined,
) {
  const output: Record<string, string> = {};

  for (const [key, metadataValue] of
    Object.entries(value ?? {})) {
    output[key.toLowerCase()] =
      clean(metadataValue);
  }

  return output;
}

function readHttpStatus(error: unknown) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("$metadata" in error)
  ) {
    return null;
  }

  const metadata = (
    error as {
      $metadata?: {
        httpStatusCode?: unknown;
      };
    }
  ).$metadata;

  return typeof metadata?.httpStatusCode ===
    "number"
    ? metadata.httpStatusCode
    : null;
}

function destroyBody(
  body: R2StreamingBody | null,
  error?: Error,
) {
  try {
    body?.destroy?.(error);
  } catch {
    // Resource cleanup must not replace the
    // authoritative inspection error.
  }
}

/**
 * Opens an exact, bounded private-R2 object stream.
 *
 * This module intentionally does not import "server-only":
 * it must be usable by the future standalone Node worker.
 */
export async function openPrivateR2WorkerObjectStream(
  args: {
    key: string;
    maxBytes: number;
    expectedSizeBytes?: number | null;
    expectedEtag?: string | null;
    abortSignal?: AbortSignal;
  },
): Promise<PrivateR2WorkerObjectStream> {
  const current = config();
  const key = safeObjectKey(args.key);

  const maxBytes = normalizePositiveInteger(
    args.maxBytes,
    "R2_MAX_BYTES_INVALID",
    "maxBytes",
  );

  if (maxBytes > ABSOLUTE_MAX_STREAM_BYTES) {
    throw new PrivateR2WorkerStreamError(
      "R2_MAX_BYTES_EXCEEDS_POLICY",
      "Requested R2 stream limit exceeds worker policy.",
    );
  }

  const expectedSizeBytes =
    args.expectedSizeBytes === undefined ||
    args.expectedSizeBytes === null
      ? null
      : normalizePositiveInteger(
          args.expectedSizeBytes,
          "R2_EXPECTED_SIZE_INVALID",
          "expectedSizeBytes",
        );

  if (
    expectedSizeBytes !== null &&
    expectedSizeBytes > maxBytes
  ) {
    throw new PrivateR2WorkerStreamError(
      "R2_EXPECTED_SIZE_EXCEEDS_LIMIT",
      "Expected R2 object size exceeds the stream limit.",
    );
  }

  const expectedEtag = normalizeEtag(
    args.expectedEtag,
  );

  let result;

  try {
    result = await client().send(
      new GetObjectCommand({
        Bucket: current.bucketName,
        Key: key,
        ...(expectedEtag
          ? {
              IfMatch:
                quotedIfMatchEtag(
                  expectedEtag,
                ),
            }
          : {}),
      }),
      args.abortSignal
        ? {
            abortSignal:
              args.abortSignal,
          }
        : undefined,
    );
  } catch (error) {
    const status = readHttpStatus(error);

    if (status === 412) {
      throw new PrivateR2WorkerStreamError(
        "R2_ETAG_PRECONDITION_FAILED",
        "Private R2 object no longer matches its verified ETag.",
      );
    }

    throw new PrivateR2WorkerStreamError(
      "R2_GET_OBJECT_FAILED",
      "Private R2 object could not be opened for scanning.",
    );
  }

  const body =
    result.Body as
      | R2StreamingBody
      | undefined;

  if (
    !body ||
    typeof body[Symbol.asyncIterator] !==
      "function"
  ) {
    throw new PrivateR2WorkerStreamError(
      "R2_BODY_NOT_STREAMABLE",
      "Private R2 object body is not streamable.",
    );
  }

  const declaredLength =
    typeof result.ContentLength === "number"
      ? result.ContentLength
      : null;

  const actualEtag = normalizeEtag(
    result.ETag,
  );

  if (
    declaredLength !== null &&
    declaredLength > maxBytes
  ) {
    destroyBody(body);

    throw new PrivateR2WorkerStreamError(
      "R2_DECLARED_SIZE_EXCEEDS_LIMIT",
      "Private R2 object exceeds the permitted scan size.",
    );
  }

  if (
    expectedSizeBytes !== null &&
    declaredLength !== null &&
    declaredLength !== expectedSizeBytes
  ) {
    destroyBody(body);

    throw new PrivateR2WorkerStreamError(
      "R2_DECLARED_SIZE_MISMATCH",
      "Private R2 object size no longer matches the verified size.",
    );
  }

  if (
    expectedEtag &&
    actualEtag !== expectedEtag
  ) {
    destroyBody(body);

    throw new PrivateR2WorkerStreamError(
      "R2_RESPONSE_ETAG_MISMATCH",
      "Private R2 object response does not match the verified ETag.",
    );
  }

  let consumed = false;

  const stream: AsyncIterable<Uint8Array> = {
    async *[Symbol.asyncIterator]() {
      if (consumed) {
        throw new PrivateR2WorkerStreamError(
          "R2_STREAM_ALREADY_CONSUMED",
          "Private R2 object stream cannot be consumed twice.",
        );
      }

      consumed = true;
      let total = 0;

      try {
        for await (const value of body) {
          const chunk = Buffer.from(value);

          if (chunk.length === 0) {
            continue;
          }

          total += chunk.length;

          if (total > maxBytes) {
            throw new PrivateR2WorkerStreamError(
              "R2_STREAM_SIZE_EXCEEDS_LIMIT",
              "Private R2 object exceeded the permitted scan size while streaming.",
            );
          }

          yield chunk;
        }

        if (
          declaredLength !== null &&
          total !== declaredLength
        ) {
          throw new PrivateR2WorkerStreamError(
            "R2_STREAM_DECLARED_SIZE_MISMATCH",
            "Private R2 stream length did not match its declared size.",
          );
        }

        if (
          expectedSizeBytes !== null &&
          total !== expectedSizeBytes
        ) {
          throw new PrivateR2WorkerStreamError(
            "R2_STREAM_EXPECTED_SIZE_MISMATCH",
            "Private R2 stream length did not match its verified size.",
          );
        }
      } finally {
        destroyBody(body);
      }
    },
  };

  return {
    key,
    contentLength: declaredLength,
    contentType:
      result.ContentType ?? null,
    etag: actualEtag,
    lastModified:
      result.LastModified ?? null,
    stream,
  };
}

/**
 * Conditionally promotes the exact scanned staging object to a destination
 * that was never authorized for browser PUT.
 *
 * This operation does not mutate the database and does not delete the staging
 * object. Those transitions belong to the guarded verdict transaction.
 */
export async function promotePrivateR2WorkerObject(
  args: {
    sourceKey: string;
    destinationKey: string;
    expectedSourceEtag: string;
    expectedSizeBytes: number;
    expectedContentType: string;
    expectedSha256: string;
    abortSignal?: AbortSignal;
  },
): Promise<PrivateR2WorkerPromotionResult> {
  const current = config();

  const sourceKey = safeObjectKey(
    args.sourceKey,
  );

  const destinationKey = safeObjectKey(
    args.destinationKey,
  );

  if (
    !sourceKey.startsWith(
      "governance-notices-staging/",
    )
  ) {
    throw new PrivateR2WorkerStreamError(
      "R2_PROMOTION_SOURCE_PREFIX_INVALID",
      "Promotion source is not a governance staging object.",
    );
  }

  if (
    !destinationKey.startsWith(
      "governance-notices-immutable/",
    )
  ) {
    throw new PrivateR2WorkerStreamError(
      "R2_PROMOTION_DESTINATION_PREFIX_INVALID",
      "Promotion destination is not an immutable governance object.",
    );
  }

  if (sourceKey === destinationKey) {
    throw new PrivateR2WorkerStreamError(
      "R2_PROMOTION_KEYS_IDENTICAL",
      "Promotion source and destination must be different.",
    );
  }

  const expectedSourceEtag =
    requiredEtag(
      args.expectedSourceEtag,
      "R2_PROMOTION_SOURCE_ETAG_REQUIRED",
    );

  const expectedSizeBytes =
    normalizePositiveInteger(
      args.expectedSizeBytes,
      "R2_PROMOTION_SIZE_INVALID",
      "expectedSizeBytes",
    );

  if (
    expectedSizeBytes >
    ABSOLUTE_MAX_STREAM_BYTES
  ) {
    throw new PrivateR2WorkerStreamError(
      "R2_PROMOTION_SIZE_EXCEEDS_POLICY",
      "Promotion size exceeds worker policy.",
    );
  }

  const expectedContentType =
    requiredContentType(
      args.expectedContentType,
    );

  const expectedSha256 =
    requiredSha256(args.expectedSha256);

  try {
    await client().send(
      new CopyObjectCommand({
        Bucket: current.bucketName,
        Key: destinationKey,

        CopySource: encodedCopySource(
          current.bucketName,
          sourceKey,
        ),

        CopySourceIfMatch:
          quotedIfMatchEtag(
            expectedSourceEtag,
          ),

        MetadataDirective: "REPLACE",
        ContentType: expectedContentType,

        Metadata: {
          "edulife-immutable": "true",
          "edulife-source-etag":
            expectedSourceEtag,
          "edulife-sha256":
            expectedSha256,
        },
      }),
      args.abortSignal
        ? {
            abortSignal:
              args.abortSignal,
          }
        : undefined,
    );
  } catch (error) {
    const status = readHttpStatus(error);

    if (status === 412) {
      throw new PrivateR2WorkerStreamError(
        "R2_PROMOTION_SOURCE_ETAG_MISMATCH",
        "Staging object changed after inspection and cannot be promoted.",
      );
    }

    throw new PrivateR2WorkerStreamError(
      "R2_PROMOTION_COPY_FAILED",
      "Private R2 object promotion failed.",
    );
  }

  let head;

  try {
    head = await client().send(
      new HeadObjectCommand({
        Bucket: current.bucketName,
        Key: destinationKey,
      }),
      args.abortSignal
        ? {
            abortSignal:
              args.abortSignal,
          }
        : undefined,
    );
  } catch {
    throw new PrivateR2WorkerStreamError(
      "R2_PROMOTION_DESTINATION_HEAD_FAILED",
      "Promoted private R2 object could not be verified.",
    );
  }

  const contentLength =
    typeof head.ContentLength === "number"
      ? head.ContentLength
      : null;

  if (
    contentLength !== expectedSizeBytes
  ) {
    throw new PrivateR2WorkerStreamError(
      "R2_PROMOTION_DESTINATION_SIZE_MISMATCH",
      "Promoted object size does not match the scanned attachment.",
    );
  }

  const contentType =
    requiredContentType(head.ContentType);

  if (
    contentType !== expectedContentType
  ) {
    throw new PrivateR2WorkerStreamError(
      "R2_PROMOTION_DESTINATION_CONTENT_TYPE_MISMATCH",
      "Promoted object content type does not match the verified attachment.",
    );
  }

  const destinationEtag =
    requiredEtag(
      head.ETag,
      "R2_PROMOTION_DESTINATION_ETAG_MISSING",
    );

  const metadata =
    normalizedMetadata(head.Metadata);

  if (
    metadata["edulife-immutable"] !==
      "true" ||
    metadata["edulife-source-etag"] !==
      expectedSourceEtag ||
    metadata["edulife-sha256"] !==
      expectedSha256
  ) {
    throw new PrivateR2WorkerStreamError(
      "R2_PROMOTION_DESTINATION_METADATA_MISMATCH",
      "Promoted object metadata does not match the scanned attachment.",
    );
  }

  return {
    sourceKey,
    destinationKey,
    sourceEtag: expectedSourceEtag,
    destinationEtag,
    contentLength,
    contentType,
    sha256Hash: expectedSha256,
    lastModified:
      head.LastModified ?? null,
  };
}