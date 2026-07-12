//src/lib/storage/privateR2.ts
import "server-only";

import { randomUUID } from "crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_UPLOAD_EXPIRY_SECONDS = 15 * 60;
const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 5 * 60;
const MIN_EXPIRY_SECONDS = 60;
const MAX_EXPIRY_SECONDS = 60 * 60;

let cachedClient: S3Client | null = null;

type PrivateR2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
};

export type PrivateR2ObjectHead = {
  key: string;
  contentLength: number | null;
  contentType: string | null;
  etag: string | null;
  metadata: Record<string, string>;
  lastModified: Date | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function requiredEnv(name: string) {
  const value = clean(process.env[name]);

  if (!value) {
    throw new Error(`Missing required private R2 environment variable: ${name}`);
  }

  return value;
}

function privateR2Config(): PrivateR2Config {
  const accountId = requiredEnv("R2_PRIVATE_ACCOUNT_ID");
  const accessKeyId = requiredEnv("R2_PRIVATE_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_PRIVATE_SECRET_ACCESS_KEY");
  const bucketName = requiredEnv("R2_PRIVATE_BUCKET_NAME");

  const configuredEndpoint = clean(process.env.R2_PRIVATE_ENDPOINT);
  const endpoint =
    configuredEndpoint ||
    `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint: endpoint.replace(/\/+$/, ""),
  };
}

function privateR2Client() {
  if (cachedClient) return cachedClient;

  const config = privateR2Config();

  cachedClient = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return cachedClient;
}

function normalizeExpiry(
  value: number | undefined,
  fallback: number,
) {
  const requested = Number(value ?? fallback);

  if (!Number.isFinite(requested)) return fallback;

  return Math.max(
    MIN_EXPIRY_SECONDS,
    Math.min(MAX_EXPIRY_SECONDS, Math.trunc(requested)),
  );
}

function normalizeExtension(value: string) {
  const extension = clean(value)
    .toLowerCase()
    .replace(/^\.+/, "");

  if (!/^[a-z0-9]{1,12}$/.test(extension)) {
    throw new Error("Invalid private R2 object extension.");
  }

  return extension;
}

function normalizePrefix(value: string) {
  const prefix = clean(value)
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");

  if (
    !prefix ||
    prefix.includes("..") ||
    !/^[a-z0-9/_-]+$/.test(prefix)
  ) {
    throw new Error("Invalid private R2 object prefix.");
  }

  return prefix;
}

function assertSafeObjectKey(value: string) {
  const key = clean(value).replace(/\\/g, "/");

  if (
    !key ||
    key.startsWith("/") ||
    key.endsWith("/") ||
    key.includes("..") ||
    key.includes("//")
  ) {
    throw new Error("Invalid private R2 object key.");
  }

  return key;
}

function safeDownloadFilename(value: string) {
  const filename = clean(value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return filename || "EduLife-OS-document";
}

function contentDispositionFilename(value: string) {
  const filename = safeDownloadFilename(value);
  const asciiFallback = filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(
    filename,
  )}`;
}

export function isPrivateR2Configured() {
  return Boolean(
    clean(process.env.R2_PRIVATE_ACCOUNT_ID) &&
      clean(process.env.R2_PRIVATE_ACCESS_KEY_ID) &&
      clean(process.env.R2_PRIVATE_SECRET_ACCESS_KEY) &&
      clean(process.env.R2_PRIVATE_BUCKET_NAME),
  );
}

/**
 * Produces an opaque private object key.
 *
 * Do not include the original filename, recipient name, school name,
 * staff ID, notice title, or other personal data in the storage key.
 */
export function buildPrivateR2ObjectKey(args: {
  prefix: string;
  extension: string;
  now?: Date;
}) {
  const prefix = normalizePrefix(args.prefix);
  const extension = normalizeExtension(args.extension);
  const now = args.now ?? new Date();

  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");

  return `${prefix}/${year}/${month}/${day}/${randomUUID()}.${extension}`;
}

/**
 * Generates a short-lived direct-upload URL.
 *
 * The browser must send the exact same Content-Type header supplied here.
 * File size and actual file signature must still be verified after upload.
 */
export async function createPrivateR2UploadUrl(args: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
  metadata?: Record<string, string>;
}) {
  const config = privateR2Config();
  const key = assertSafeObjectKey(args.key);
  const contentType = clean(args.contentType);

  if (!contentType) {
    throw new Error("Private R2 upload content type is required.");
  }

  const expiresIn = normalizeExpiry(
    args.expiresInSeconds,
    DEFAULT_UPLOAD_EXPIRY_SECONDS,
  );

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    ContentType: contentType,
    Metadata: args.metadata,
  });

  const uploadUrl = await getSignedUrl(privateR2Client(), command, {
    expiresIn,
  });

  return {
    key,
    uploadUrl,
    method: "PUT" as const,
    expiresInSeconds: expiresIn,
    requiredHeaders: {
      "Content-Type": contentType,
    },
  };
}

/**
 * Generates a short-lived authenticated download URL.
 *
 * Callers must complete recipient/sender/scope authorization before invoking
 * this function. This helper signs storage access; it does not authorize users.
 */
export async function createPrivateR2DownloadUrl(args: {
  key: string;
  downloadFilename: string;
  contentType?: string | null;
  expiresInSeconds?: number;
}) {
  const config = privateR2Config();
  const key = assertSafeObjectKey(args.key);
  const expiresIn = normalizeExpiry(
    args.expiresInSeconds,
    DEFAULT_DOWNLOAD_EXPIRY_SECONDS,
  );

  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    ResponseContentDisposition: contentDispositionFilename(
      args.downloadFilename,
    ),
    ...(clean(args.contentType)
      ? { ResponseContentType: clean(args.contentType) }
      : {}),
  });

  const downloadUrl = await getSignedUrl(privateR2Client(), command, {
    expiresIn,
  });

  return {
    key,
    downloadUrl,
    expiresInSeconds: expiresIn,
  };
}

/**
 * Reads authoritative object metadata after a direct browser upload.
 *
 * Use this before changing an attachment from PENDING_UPLOAD to UPLOADED/READY.
 */
export async function headPrivateR2Object(
  objectKey: string,
): Promise<PrivateR2ObjectHead> {
  const config = privateR2Config();
  const key = assertSafeObjectKey(objectKey);

  const result = await privateR2Client().send(
    new HeadObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
  );

  return {
    key,
    contentLength:
      typeof result.ContentLength === "number"
        ? result.ContentLength
        : null,
    contentType: result.ContentType ?? null,
    etag: result.ETag?.replace(/^"|"$/g, "") ?? null,
    metadata: result.Metadata ?? {},
    lastModified: result.LastModified ?? null,
  };
}

/**
 * Reads a private object into memory for server-side security inspection.
 *
 * Callers must keep maxBytes low. Governance notice attachments are currently
 * capped at 10 MB, so this helper intentionally does not support large files.
 */
export async function readPrivateR2ObjectBytes(args: {
  key: string;
  maxBytes: number;
}) {
  const config = privateR2Config();
  const key = assertSafeObjectKey(args.key);
  const maxBytes = Math.max(1, Math.trunc(Number(args.maxBytes)));

  if (!Number.isFinite(maxBytes)) {
    throw new Error("Invalid private R2 maximum read size.");
  }

  const result = await privateR2Client().send(
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
  );

  const declaredLength =
    typeof result.ContentLength === "number"
      ? result.ContentLength
      : null;

  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new Error("Private R2 object exceeds the permitted inspection size.");
  }

  const body = result.Body as
    | {
        transformToByteArray?: () => Promise<Uint8Array>;
        [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>;
      }
    | undefined;

  if (!body) {
    throw new Error("Private R2 object body is empty.");
  }

  let bytes: Buffer;

  if (typeof body.transformToByteArray === "function") {
    const value = await body.transformToByteArray();

    if (value.byteLength > maxBytes) {
      throw new Error("Private R2 object exceeds the permitted inspection size.");
    }

    bytes = Buffer.from(value);
  } else if (body[Symbol.asyncIterator]) {
    const chunks: Buffer[] = [];
    let total = 0;

    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      const buffer = Buffer.from(chunk);
      total += buffer.length;

      if (total > maxBytes) {
        throw new Error(
          "Private R2 object exceeds the permitted inspection size.",
        );
      }

      chunks.push(buffer);
    }

    bytes = Buffer.concat(chunks, total);
  } else {
    throw new Error("Private R2 object stream is not readable.");
  }

  return {
    key,
    bytes,
    contentLength: declaredLength ?? bytes.length,
    contentType: result.ContentType ?? null,
    etag: result.ETag?.replace(/^"|"$/g, "") ?? null,
    metadata: result.Metadata ?? {},
    lastModified: result.LastModified ?? null,
  };
}

/**
 * Deletes an abandoned or rejected unsealed upload.
 *
 * Application logic must refuse deletion after an attachment is SEALED.
 */
export async function deletePrivateR2Object(objectKey: string) {
  const config = privateR2Config();
  const key = assertSafeObjectKey(objectKey);

  await privateR2Client().send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
  );

  return { key, deleted: true as const };
}
