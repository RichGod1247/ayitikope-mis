// src/lib/totp.ts
import crypto from "crypto";
import { authenticator } from "otplib";

/**
 * ============================================================
 * EduLife OS — TOTP + Envelope Encryption Helper (Production)
 * ============================================================
 *
 * DB columns (canonical, from your SQL inspection):
 * - twoFactorSecretCiphertext      (TEXT)
 * - twoFactorSecretKeyCiphertext   (TEXT)  // encrypted DEK (envelope)
 * - twoFactorSecretIv              (TEXT)
 * - twoFactorSecretTag             (TEXT)
 * - twoFactorEnabled               (BOOLEAN)
 * - twoFactorSetupAt               (TIMESTAMPTZ)
 *
 * We do:
 * - Generate TOTP secret (base32 via otplib)
 * - Encrypt secret with a per-secret DEK using AES-256-GCM
 * - "Wrap" (encrypt) the DEK using a KEK (Key Encryption Key)
 *
 * NOTE on KMS:
 * - In production, you'd wrap/unwrap the DEK using a real KMS (AWS/GCP/Azure).
 * - To avoid blocking deployment, this file implements a KMS-like KEK wrapper
 *   using an env-held KEK. This is STILL envelope encryption and deployable:
 *   schema and flow will not change later — only the wrap/unwrap implementation.
 */

// ---------------------------
// Types
// ---------------------------
export type TwoFactorSecretEnvelope = {
  twoFactorSecretCiphertext: string; // base64
  twoFactorSecretKeyCiphertext: string; // base64 (wrapped DEK)
  twoFactorSecretIv: string; // base64
  twoFactorSecretTag: string; // base64
};

// ---------------------------
// Config
// ---------------------------

// Issuer label shown in authenticator apps.
// Keep it stable; changing later creates confusion for users.
const DEFAULT_ISSUER = process.env.TOTP_ISSUER || "EduLife OS";

// otplib config (safe defaults)
authenticator.options = {
  step: 30, // 30s standard
  window: 1, // allow slight clock drift
};

/**
 * KEK (Key Encryption Key) — used to wrap the DEK.
 * For now, we store KEK in env as base64(32 bytes) for AES-256-GCM wrapping.
 *
 * You already generated something like:
 *   GF7JfI5/weL53QSjEkd1RYaQ2dGDAKtr/Nbv+5U92UQ=
 *
 * Put it in:
 *   TOTP_KEK_BASE64="GF7JfI5/weL53QSjEkd1RYaQ2dGDAKtr/Nbv+5U92UQ="
 *
 * In real KMS mode later, keep the same envelope format — only wrap/unwrap changes.
 */
function getKek(): Buffer {
  const b64 = process.env.TOTP_KEK_BASE64;
  if (!b64) {
    throw new Error(
      "Missing TOTP_KEK_BASE64. Generate 32 bytes and set as base64 in .env.local / production secrets."
    );
  }
  const kek = Buffer.from(b64, "base64");
  if (kek.length !== 32) {
    throw new Error("TOTP_KEK_BASE64 must decode to 32 bytes (AES-256 key).");
  }
  return kek;
}

// ---------------------------
// Small helpers
// ---------------------------
function b64(buf: Buffer) {
  return buf.toString("base64");
}

function fromB64(s: string) {
  return Buffer.from(s, "base64");
}

function normalizeOtp(token: string) {
  return String(token || "").replace(/\s+/g, "").trim();
}

// ---------------------------
// Public API — TOTP
// ---------------------------

export function generateTotpSecret(): string {
  // otplib generates a base32 secret
  return authenticator.generateSecret();
}

export function buildOtpAuthUrl(opts: {
  issuer?: string;
  accountName: string; // email or staffId label
  secret: string;
}): string {
  const issuer = opts.issuer || DEFAULT_ISSUER;
  // Key URI format (otpauth://) used by authenticator apps
  return authenticator.keyuri(opts.accountName, issuer, opts.secret);
}

export function verifyTotp(opts: { token: string; secret: string }): boolean {
  const token = normalizeOtp(opts.token);
  if (!token) return false;
  return authenticator.check(token, opts.secret);
}

// ---------------------------
// Envelope encryption (AES-256-GCM)
// ---------------------------

/**
 * Encrypts a plaintext TOTP secret into the envelope fields expected by User columns.
 */
export function encryptTotpSecret(plaintextSecret: string): TwoFactorSecretEnvelope {
  const secret = String(plaintextSecret || "").trim();
  if (!secret) throw new Error("Cannot encrypt empty TOTP secret.");

  // 1) Generate a per-secret DEK (Data Encryption Key)
  const dek = crypto.randomBytes(32); // AES-256

  // 2) Encrypt secret with DEK using AES-256-GCM
  const iv = crypto.randomBytes(12); // 96-bit nonce for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // 3) Wrap DEK with KEK (KMS-like)
  const wrapped = wrapDekWithKek(dek);

  return {
    twoFactorSecretCiphertext: b64(ciphertext),
    twoFactorSecretKeyCiphertext: wrapped, // base64
    twoFactorSecretIv: b64(iv),
    twoFactorSecretTag: b64(tag),
  };
}

/**
 * Decrypts a stored envelope back to the plaintext secret.
 */
export function decryptTotpSecret(env: TwoFactorSecretEnvelope): string {
  if (
    !env?.twoFactorSecretCiphertext ||
    !env?.twoFactorSecretKeyCiphertext ||
    !env?.twoFactorSecretIv ||
    !env?.twoFactorSecretTag
  ) {
    throw new Error("Missing 2FA secret envelope fields.");
  }

  // 1) Unwrap DEK
  const dek = unwrapDekWithKek(env.twoFactorSecretKeyCiphertext);

  // 2) Decrypt ciphertext with AES-256-GCM
  const iv = fromB64(env.twoFactorSecretIv);
  const tag = fromB64(env.twoFactorSecretTag);
  const ciphertext = fromB64(env.twoFactorSecretCiphertext);

  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return plaintext;
}

// ---------------------------
// KEK wrap/unwrap (KMS-like envelope wrapper)
// ---------------------------

/**
 * Wrap DEK using KEK via AES-256-GCM.
 * Output format (base64) packs: iv(12) + tag(16) + ciphertext(variable)
 * This keeps DB column count stable (we store in twoFactorSecretKeyCiphertext only).
 */
function wrapDekWithKek(dek: Buffer): string {
  const kek = getKek();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", kek, iv);
  const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Pack = iv | tag | ct
  const packed = Buffer.concat([iv, tag, ct]);
  return b64(packed);
}

/**
 * Unwrap DEK using KEK (reverse of wrapDekWithKek).
 */
function unwrapDekWithKek(wrappedB64: string): Buffer {
  const kek = getKek();
  const packed = fromB64(wrappedB64);

  // iv(12) + tag(16) + ct(rest)
  if (packed.length < 12 + 16 + 1) {
    throw new Error("Invalid wrapped DEK payload.");
  }

  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ct = packed.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", kek, iv);
  decipher.setAuthTag(tag);
  const dek = Buffer.concat([decipher.update(ct), decipher.final()]);

  if (dek.length !== 32) {
    throw new Error("Unwrapped DEK length is invalid.");
  }
  return dek;
}

/**
 * Convenience:
 * Verify a token against the stored encrypted envelope fields directly.
 */
export function verifyTotpWithEnvelope(opts: {
  token: string;
  envelope: TwoFactorSecretEnvelope;
}): boolean {
  const secret = decryptTotpSecret(opts.envelope);
  return verifyTotp({ token: opts.token, secret });
}
