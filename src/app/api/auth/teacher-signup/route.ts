// src/app/api/auth/teacher-signup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { verifyOnboardingCode } from "@/lib/onboardingCode";
import { hashInviteCode } from "@/lib/inviteCodes";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";
import bcrypt from "bcryptjs";
import { normalizeStaffIdNorm } from "@/lib/staffId";
import { normalizeTeacherClassLevel } from "@/lib/teacherScope";
import { replaceTeacherAssessmentAssignmentsForProfile } from "@/lib/assessments/teacherAssignmentSync";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FieldErrors = Record<string, string>;
type TeacherPhase = "KG" | "PRIMARY" | "JHS";

type JhsAssignment = {
  subject: string;
  subjectSlug?: string | null;
  classes: string[];
};

type CanonicalJhsAssignment = {
  subject: string;
  subjectSlug: null;
  classes: Array<"JHS 1" | "JHS 2" | "JHS 3">;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function jsonFail(msg: string, status = 400, fieldErrors?: FieldErrors) {
  return NextResponse.json(
    { ok: false, error: msg, fieldErrors: fieldErrors ?? null },
    {
      status,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    }
  );
}

function jsonOk(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function cleanEmail(v: unknown) {
  return String(v ?? "").toLowerCase().trim();
}

function cleanPhone(v: unknown) {
  const raw = cleanStr(v).replace(/\s+/g, "");
  let p = raw.replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("0") && p.length === 10) p = `+233${p.slice(1)}`;
  if (p.startsWith("233") && !p.startsWith("+233")) p = `+${p}`;
  return p;
}

function isPhoneE164ish(p: string) {
  return /^\+\d{9,15}$/.test(p);
}

function isTeacherPhase(v: string): v is TeacherPhase {
  return v === "KG" || v === "PRIMARY" || v === "JHS";
}

function safeInternalPath(raw: unknown) {
  const fallback = "/app";
  const v = cleanStr(raw);
  if (!v) return fallback;
  if (v.startsWith("//") || v.startsWith("\\") || v.startsWith("\\\\")) return fallback;
  if (v.startsWith("/")) return v;
  try {
    const u = new URL(v);
    const path = `${u.pathname}${u.search}${u.hash}`.trim();
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    return path || fallback;
  } catch {
    return fallback;
  }
}

function extractInviteTokenLoose(raw: unknown) {
  const v = cleanStr(raw);
  if (!v) return "";
  try {
    if (v.startsWith("http://") || v.startsWith("https://")) {
      const u = new URL(v);
      return cleanStr(u.searchParams.get("invite") || u.searchParams.get("token") || "");
    }
  } catch {
    // ignore
  }
  return v;
}

const VALID_JHS_CLASSES = new Set(["JHS 1", "JHS 2", "JHS 3"] as const);
const JHS_CLASS_ORDER: Array<"JHS 1" | "JHS 2" | "JHS 3"> = ["JHS 1", "JHS 2", "JHS 3"];

function sortJhsClasses(xs: Array<"JHS 1" | "JHS 2" | "JHS 3">) {
  const s = new Set(xs);
  return JHS_CLASS_ORDER.filter((c) => s.has(c));
}

function normalizeSubjectSlug(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) return null;
  return v;
}

function normalizeSubjectKey(name: string) {
  return cleanStr(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripJhsDecorators(nameRaw: string) {
  let s = cleanStr(nameRaw);

  s = s.replace(
    /^\s*JHS\s*(?:\(?\s*[1-3](?:\s*,\s*[1-3])*\s*\)?|[1-3])\s*[-:–—]?\s*/i,
    ""
  );
  s = s.replace(/^\s*JUNIOR\s+HIGH\s+SCHOOL\s*(?:\(?\s*[1-3]\s*\)?|[1-3])?\s*[-:–—]?\s*/i, "");
  s = s.replace(/^\s*BASIC\s*[7-9]\s*[-:–—]?\s*/i, "");
  s = s.replace(/^\s*B\s*[7-9]\s*[-:–—]?\s*/i, "");
  s = s.replace(/\s*\(\s*JHS\s*[1-3](?:\s*,\s*[1-3])*\s*\)\s*$/i, "");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/**
 * Accept BOTH:
 * - UI class tokens: "JHS 1"
 * - DB level tokens: "Basic 7" => JHS1, "Basic 8" => JHS2, "Basic 9" => JHS3
 */
function normalizeJhsLevelToken(raw: unknown): "JHS1" | "JHS2" | "JHS3" | null {
  const v = cleanStr(raw).toUpperCase();

  let m =
    v.match(/^JHS\s*([1-3])$/) ||
    v.match(/^J\.?H\.?S\.?\s*([1-3])$/) ||
    v.match(/^JHS([1-3])$/) ||
    v.match(/^JUNIOR\s+HIGH\s+SCHOOL\s*([1-3])$/);
  if (m) return `JHS${m[1]}` as "JHS1" | "JHS2" | "JHS3";

  m = v.match(/^BASIC\s*([7-9])$/) || v.match(/^B\s*([7-9])$/);
  if (m) {
    const n = Number(m[1]);
    if (n === 7) return "JHS1";
    if (n === 8) return "JHS2";
    if (n === 9) return "JHS3";
  }

  return null;
}

function normalizeAssignments(v: unknown): JhsAssignment[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: JhsAssignment[] = [];
  for (const row of v) {
    if (!isRecord(row)) continue;
    const subject = cleanStr((row as any).subject);
    const subjectSlugRaw = cleanStr((row as any).subjectSlug);
    const subjectSlug = subjectSlugRaw ? normalizeSubjectSlug(subjectSlugRaw) : null;

    const classesRaw = Array.isArray((row as any).classes) ? ((row as any).classes as any[]) : [];
    const classes = classesRaw
      .map((c) => cleanStr(c).toUpperCase().replace(/\s+/g, " ").trim())
      .filter((c) => VALID_JHS_CLASSES.has(c as any));

    if ((subject || subjectSlug) && classes.length > 0) {
      out.push({ subject, subjectSlug, classes: Array.from(new Set(classes)) });
    }
  }
  return out.length ? out : undefined;
}

const DB_JHS_PHASES = ["Junior High School", "JHS", "Junior High"];
const DB_JHS_LEVELS = ["Basic 7", "Basic 8", "Basic 9", "JHS 1", "JHS 2", "JHS 3"];

type JhsIndex = {
  levelSubjectExists: Set<string>;
  allLevelsSubjectExists: Set<string>;
  subjectExists: Set<string>;
  slugToSubjectKey: Map<string, string>;
  canonicalNameByKey: Map<string, string>;
};

let jhsIndexCache: { at: number; index: JhsIndex } | null = null;
const JHS_INDEX_TTL_MS = 5 * 60 * 1000;

async function getJhsIndexCached(): Promise<JhsIndex> {
  const now = Date.now();
  if (jhsIndexCache && now - jhsIndexCache.at < JHS_INDEX_TTL_MS) return jhsIndexCache.index;

  const rows = await prisma.curriculumSubject.findMany({
    where: {
      isActive: true,
      OR: [{ phase: { in: DB_JHS_PHASES } }, { level: { in: DB_JHS_LEVELS } }],
    },
    select: { name: true, slug: true, level: true },
  });

  const levelSubjectExists = new Set<string>();
  const allLevelsSubjectExists = new Set<string>();
  const subjectExists = new Set<string>();
  const slugToSubjectKey = new Map<string, string>();
  const canonicalNameByKey = new Map<string, string>();

  for (const r of rows) {
    const rawName = cleanStr(r.name);
    const canonicalName = stripJhsDecorators(rawName);
    const subjectKey = normalizeSubjectKey(canonicalName || rawName);
    if (!subjectKey) continue;

    subjectExists.add(subjectKey);

    const lvl = normalizeJhsLevelToken(r.level);
    if (lvl) levelSubjectExists.add(`${lvl}::${subjectKey}`);
    else allLevelsSubjectExists.add(subjectKey);

    const slug = normalizeSubjectSlug(r.slug);
    if (slug) slugToSubjectKey.set(slug, subjectKey);

    if (!canonicalNameByKey.has(subjectKey)) {
      canonicalNameByKey.set(subjectKey, canonicalName || rawName);
    }
  }

  const index: JhsIndex = {
    levelSubjectExists,
    allLevelsSubjectExists,
    subjectExists,
    slugToSubjectKey,
    canonicalNameByKey,
  };

  jhsIndexCache = { at: now, index };
  return index;
}

const JHS_STRICT = String(process.env.AUTH_JHS_SUBJECT_STRICT || "").trim() === "1";

async function canonicalizeJhsAssignmentsOrFail(assignments: JhsAssignment[] | undefined) {
  const fieldErrors: FieldErrors = {};

  if (!assignments || assignments.length === 0) {
    fieldErrors.jhsAssignments = "Add at least one subject + class list for JHS.";
    return { ok: false as const, fieldErrors };
  }

  let index: JhsIndex;
  try {
    index = await getJhsIndexCached();
  } catch {
    return {
      ok: false as const,
      fieldErrors: {
        jhsAssignments:
          "Cannot validate JHS subjects against curriculum. Ensure curriculum seeding and schema are correct.",
      },
    };
  }

  const canonical: CanonicalJhsAssignment[] = [];
  const seenSubjectKeys = new Set<string>();

  for (let i = 0; i < assignments.length; i++) {
    const row = assignments[i];

    const classesRaw = Array.isArray(row.classes) ? row.classes : [];
    const validClasses = classesRaw
      .map((c) => cleanStr(c).toUpperCase().replace(/\s+/g, " ").trim())
      .filter((c) => VALID_JHS_CLASSES.has(c as any)) as Array<"JHS 1" | "JHS 2" | "JHS 3">;

    if (!validClasses.length) {
      fieldErrors.jhsAssignments =
        "Each JHS subject must have at least one of: JHS 1, JHS 2, JHS 3.";
      fieldErrors[`jhsSubject_${i}`] = "Select at least one class for this subject.";
      continue;
    }

    const subjNameRaw = cleanStr(row.subject);
    const subjNameCanonical = stripJhsDecorators(subjNameRaw);
    const subjSlug = row.subjectSlug ? normalizeSubjectSlug(row.subjectSlug) : null;

    const keyFromName = subjNameCanonical ? normalizeSubjectKey(subjNameCanonical) : "";
    const keyFromSlug = subjSlug ? index.slugToSubjectKey.get(subjSlug) ?? "" : "";
    const subjectKey = keyFromName || keyFromSlug;

    if (!subjectKey || !index.subjectExists.has(subjectKey)) {
      fieldErrors.jhsAssignments =
        "Invalid JHS subject selection. Please refresh and select from the list again.";
      fieldErrors[`jhsSubject_${i}`] = "Invalid subject. Refresh and select again.";
      continue;
    }

    if (JHS_STRICT) {
      let okForAll = true;
      for (const cls of validClasses) {
        const lvl = normalizeJhsLevelToken(cls);
        if (!lvl) continue;

        const levelPairOk =
          index.levelSubjectExists.has(`${lvl}::${subjectKey}`) ||
          index.allLevelsSubjectExists.has(subjectKey);

        if (!levelPairOk) {
          okForAll = false;
          break;
        }
      }

      if (!okForAll) {
        fieldErrors.jhsAssignments =
          "Selected subject is not available for one or more chosen JHS classes. Please refresh and try again.";
        fieldErrors[`jhsSubject_${i}`] = "Not available for one of the selected classes.";
        continue;
      }
    }

    if (seenSubjectKeys.has(subjectKey)) {
      fieldErrors.jhsAssignments = "Duplicate subject detected. Each subject should be selected once.";
      fieldErrors[`jhsSubject_${i}`] = "Duplicate subject. Remove one.";
      continue;
    }
    seenSubjectKeys.add(subjectKey);

    const canonicalName =
      index.canonicalNameByKey.get(subjectKey) || subjNameCanonical || subjNameRaw;

    canonical.push({
      subject: canonicalName,
      subjectSlug: null,
      classes: sortJhsClasses(Array.from(new Set(validClasses))),
    });
  }

  if (Object.keys(fieldErrors).length) return { ok: false as const, fieldErrors };
  if (!canonical.length) {
    return {
      ok: false as const,
      fieldErrors: { jhsAssignments: "Add at least one valid JHS subject assignment." },
    };
  }

  canonical.sort((a, b) => normalizeSubjectKey(a.subject).localeCompare(normalizeSubjectKey(b.subject)));
  return { ok: true as const, items: canonical };
}

function normalizeJhsAssignmentsForCompare(v: unknown) {
  if (!Array.isArray(v)) return [];
  const out: Array<{ key: string; classes: Array<"JHS 1" | "JHS 2" | "JHS 3"> }> = [];
  for (const row of v) {
    if (!isRecord(row)) continue;
    const subjectRaw = cleanStr((row as any).subject);
    const subject = stripJhsDecorators(subjectRaw);
    const key = normalizeSubjectKey(subject);

    const classesRaw = Array.isArray((row as any).classes) ? ((row as any).classes as any[]) : [];
    const classes = classesRaw
      .map((c) => cleanStr(c).toUpperCase().replace(/\s+/g, " ").trim())
      .filter((c) => VALID_JHS_CLASSES.has(c as any)) as Array<"JHS 1" | "JHS 2" | "JHS 3">;

    if (!key || !classes.length) continue;
    out.push({ key, classes: sortJhsClasses(Array.from(new Set(classes))) });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

async function resolveTenantIdOrNull(raw: string | null | undefined) {
  const v = cleanStr(raw);
  if (!v) return null;

  const byId = await prisma.tenant.findFirst({ where: { id: v }, select: { id: true } });
  if (byId?.id) return byId.id;

  const bySchoolCode = await prisma.tenant.findFirst({
    where: { schoolCode: { equals: v, mode: "insensitive" } },
    select: { id: true },
  });
  if (bySchoolCode?.id) return bySchoolCode.id;

  const bySlug = await prisma.tenant.findFirst({
    where: { slug: { equals: v, mode: "insensitive" } },
    select: { id: true },
  });
  if (bySlug?.id) return bySlug.id;

  const byEmis = await prisma.tenant.findFirst({
    where: { emisCode: { equals: v, mode: "insensitive" } },
    select: { id: true },
  });
  if (byEmis?.id) return byEmis.id;

  return null;
}

const SIGNUP_WINDOW_SECONDS = Number(process.env.AUTH_SIGNUP_WINDOW_SECONDS || 60 * 60);
const SIGNUP_LIMIT_PER_IP = Number(process.env.AUTH_SIGNUP_LIMIT_PER_IP || 20);
const SIGNUP_LIMIT_PER_EMAIL = Number(process.env.AUTH_SIGNUP_LIMIT_PER_EMAIL || 10);

async function checkRateLimits(ip: string | null, email: string, userAgent: string | null) {
  const ipKey = ip ? `teacherSignup:ip:${ip}` : null;
  if (ipKey) {
    const lim = await rateLimitCheck({
      action: "AUTH_TEACHER_SIGNUP_FAIL",
      key: ipKey,
      limit: SIGNUP_LIMIT_PER_IP,
      windowSeconds: SIGNUP_WINDOW_SECONDS,
    });
    if (!lim.ok) return { ok: false as const, retryAfterSeconds: lim.retryAfterSeconds };
  }

  const emailKey = `teacherSignup:email:${email}`;
  {
    const lim = await rateLimitCheck({
      action: "AUTH_TEACHER_SIGNUP_FAIL",
      key: emailKey,
      limit: SIGNUP_LIMIT_PER_EMAIL,
      windowSeconds: SIGNUP_WINDOW_SECONDS,
    });
    if (!lim.ok) return { ok: false as const, retryAfterSeconds: lim.retryAfterSeconds };
  }

  return { ok: true as const };
}

async function recordFail(ip: string | null, userAgent: string | null, email: string, reason: string) {
  const ipKey = ip ? `teacherSignup:ip:${ip}` : null;
  if (ipKey) {
    await rateLimitRecord({
      action: "AUTH_TEACHER_SIGNUP_FAIL",
      key: ipKey,
      ip,
      userAgent,
      metadata: { reason, email },
    });
  }
  await rateLimitRecord({
    action: "AUTH_TEACHER_SIGNUP_FAIL",
    key: `teacherSignup:email:${email}`,
    ip,
    userAgent,
    metadata: { reason, email },
  });
}

async function verifyExistingPasswordOrThrow(password: string, passwordHash: string) {
  let ok = await verifyPassword(password, passwordHash);

  if (!ok) {
    const legacyOk = await bcrypt.compare(password, passwordHash).catch(() => false);
    if (legacyOk) ok = true;
  }

  if (!ok) throw new Error("ACCOUNT_EXISTS_BAD_PASSWORD");
  return true;
}

async function upgradeLegacyHashIfNeeded(
  tx: Prisma.TransactionClient,
  userId: string,
  password: string,
  existingHash: string
) {
  const okNew = await verifyPassword(password, existingHash);
  if (okNew) return;

  const legacyOk = await bcrypt.compare(password, existingHash).catch(() => false);
  if (!legacyOk) return;

  const upgraded = await hashPassword(password);
  await tx.user.update({ where: { id: userId }, data: { passwordHash: upgraded } });
}

function prismaTargetIncludes(err: any, needle: string) {
  const t = err?.meta?.target;
  if (Array.isArray(t)) return t.includes(needle);
  if (typeof t === "string") return t.includes(needle);
  return false;
}

type ResolvedAccess =
  | {
      method: "INVITE_CODE";
      tenantId: string;
      roleId: string;
      roleName: "TEACHER" | "HEADTEACHER";
      inviteCode: { id: string; tenantId: string; maxUses: number };
    }
  | {
      method: "INVITE";
      tenantId: string;
      roleId: string;
      roleName: "TEACHER" | "HEADTEACHER";
      inviteRowId: string;
    }
  | { method: "ONBOARDING"; tenantId: string; roleId: string; roleName: "TEACHER" };

async function resolveAccessOrThrow(opts: {
  usingInviteCode: boolean;
  inviteCode: string;
  usingInvite: boolean;
  inviteToken: string;
  tenantIdRaw: string;
  onboardingCode: string;
  email: string;
}) {
  const now = new Date();

  if (opts.usingInviteCode) {
    const codeHash = hashInviteCode(opts.inviteCode);
    const invite = await prisma.inviteCode.findUnique({
      where: { codeHash },
      select: {
        id: true,
        tenantId: true,
        roleId: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        revokedAt: true,
        role: { select: { name: true } },
        tenant: { select: { status: true } },
      },
    });

    if (
      !invite ||
      invite.revokedAt ||
      invite.expiresAt.getTime() <= now.getTime() ||
      invite.usedCount >= invite.maxUses ||
      !invite.tenant ||
      invite.tenant.status !== "ACTIVE"
    ) {
      throw new Error("INVALID_OR_EXPIRED_CODE");
    }

    const roleName = String(invite.role?.name ?? "").toUpperCase();
    if (roleName === "PARENT") throw new Error("CODE_REQUIRES_PARENT_SIGNUP");
    if (roleName !== "TEACHER" && roleName !== "HEADTEACHER")
      throw new Error("CODE_REQUIRES_STAFF_SIGNUP");

    return {
      method: "INVITE_CODE" as const,
      tenantId: invite.tenantId,
      roleId: invite.roleId,
      roleName: roleName as "TEACHER" | "HEADTEACHER",
      inviteCode: { id: invite.id, tenantId: invite.tenantId, maxUses: invite.maxUses },
    };
  }

  if (opts.usingInvite) {
    const invite = await prisma.invite.findUnique({
      where: { token: opts.inviteToken },
      select: {
        id: true,
        tenantId: true,
        roleId: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        role: { select: { name: true } },
        tenant: { select: { status: true } },
      },
    });

    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() <= now.getTime())
      throw new Error("INVALID_OR_EXPIRED_INVITE");
    if (!invite.tenant || invite.tenant.status !== "ACTIVE") throw new Error("TENANT_NOT_ACTIVE");

    const mustMatch = cleanEmail(invite.email);
    if (mustMatch && mustMatch !== opts.email) throw new Error("INVITE_EMAIL_MISMATCH");

    const roleName = String(invite.role?.name ?? "").toUpperCase();
    if (roleName === "PARENT") throw new Error("CODE_REQUIRES_PARENT_SIGNUP");
    if (roleName !== "TEACHER" && roleName !== "HEADTEACHER")
      throw new Error("CODE_REQUIRES_STAFF_SIGNUP");

    return {
      method: "INVITE" as const,
      tenantId: invite.tenantId,
      roleId: invite.roleId,
      roleName: roleName as "TEACHER" | "HEADTEACHER",
      inviteRowId: invite.id,
    };
  }

  const resolved = await resolveTenantIdOrNull(opts.tenantIdRaw);
  if (!resolved) throw new Error("TENANT_NOT_FOUND");

  const ok = await verifyOnboardingCode(resolved, opts.onboardingCode);
  if (!ok) throw new Error("INVALID_ONBOARDING_CODE");

  const t = await prisma.tenant.findUnique({ where: { id: resolved }, select: { status: true } });
  if (!t || t.status !== "ACTIVE") throw new Error("TENANT_NOT_ACTIVE");

  const teacherRole = await prisma.role.findFirst({
    where: { tenantId: resolved, name: "TEACHER" },
    select: { id: true },
  });
  if (!teacherRole) throw new Error("ROLE_NOT_FOUND_IN_TENANT");

  return {
    method: "ONBOARDING" as const,
    tenantId: resolved,
    roleId: teacherRole.id,
    roleName: "TEACHER" as const,
  };
}

function parseBoolean(v: unknown) {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return false;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown;
  if (!isRecord(body)) return jsonFail("INVALID_PAYLOAD");

  const headers = req.headers;
  const ip = getIpFromHeaders(headers);
  const userAgent = getUserAgentFromHeaders(headers);

  const firstName = cleanStr((body as any).firstName);
  const lastName = cleanStr((body as any).lastName);
  const staffId = cleanStr((body as any).staffId);
  const staffIdNorm = normalizeStaffIdNorm(staffId);

  const email = cleanEmail((body as any).email);
  const phone = cleanPhone((body as any).phone);
  const password = cleanStr((body as any).password);

  const redirectTo = safeInternalPath((body as any).redirectTo);

  const teachesFlag = parseBoolean((body as any).teaches);

  const inviteToken = extractInviteTokenLoose((body as any).inviteToken);
  const inviteCode = cleanStr((body as any).inviteCode || (body as any).code);
  const tenantIdRaw = cleanStr((body as any).tenantId);
  const onboardingCode = cleanStr((body as any).onboardingCode);

  const usingInvite = !!inviteToken;
  const usingInviteCode = !!inviteCode;

  if (!email) return jsonFail("VALIDATION_FAILED", 400, { email: "Email is required." });
  const lim = await checkRateLimits(ip, email, userAgent);
  if (!lim.ok) return jsonFail("RATE_LIMITED", 429, { retryAfterSeconds: String(lim.retryAfterSeconds ?? 60) });

  const fe: FieldErrors = {};
  if (!firstName) fe.firstName = "First name is required.";
  if (!lastName) fe.lastName = "Last name is required.";
  if (!staffId) fe.staffId = "Staff ID is required.";
  if (!staffIdNorm) fe.staffId = "Staff ID is invalid.";
  if (!email) fe.email = "Email is required.";
  if (!phone) fe.phone = "Phone is required.";
  if (phone && !isPhoneE164ish(phone)) fe.phone = "Phone must be a valid E.164 number (e.g. +233...).";
  if (!password) fe.password = "Password is required.";
  if (password && password.length < 8) fe.password = "Password must be at least 8 characters.";

  if (!usingInvite && !usingInviteCode && !(tenantIdRaw && onboardingCode)) {
    fe.onboardingCode = "Provide invite token OR invite code OR tenant + onboarding code.";
  }
  if (usingInvite && (usingInviteCode || tenantIdRaw || onboardingCode)) fe.inviteToken = "Use only one signup method.";
  if (usingInviteCode && (usingInvite || tenantIdRaw || onboardingCode)) fe.inviteCode = "Use only one signup method.";
  if (!usingInvite && !usingInviteCode) {
    if (!tenantIdRaw) fe.tenantId = "School code (tenant) is required.";
    if (!onboardingCode) fe.onboardingCode = "Onboarding code is required.";
  }

  if (Object.keys(fe).length) {
    await recordFail(ip, userAgent, email || "unknown", "VALIDATION_FAILED");
    return jsonFail("VALIDATION_FAILED", 400, fe);
  }

  let resolved: ResolvedAccess;
  try {
    resolved = await resolveAccessOrThrow({
      usingInviteCode,
      inviteCode,
      usingInvite,
      inviteToken,
      tenantIdRaw,
      onboardingCode,
      email,
    });
  } catch (err: any) {
    const msg = String(err?.message || "ERR");
    const fe2: FieldErrors = {};

    if (msg === "INVALID_OR_EXPIRED_CODE") fe2.inviteCode = "Invalid or expired code.";
    else if (msg === "INVALID_OR_EXPIRED_INVITE") fe2.inviteToken = "Invalid or expired invite.";
    else if (msg === "INVITE_EMAIL_MISMATCH") fe2.email = "Use the same email that was invited.";
    else if (msg === "TENANT_NOT_FOUND") fe2.tenantId = "School not found.";
    else if (msg === "INVALID_ONBOARDING_CODE") fe2.onboardingCode = "Invalid onboarding code.";
    else if (msg === "TENANT_NOT_ACTIVE") return jsonFail("TENANT_NOT_ACTIVE", 403);
    else if (msg === "CODE_REQUIRES_PARENT_SIGNUP") fe2.inviteCode = "This code is for Parent signup.";
    else if (msg === "CODE_REQUIRES_STAFF_SIGNUP") fe2.inviteCode = "This code is not valid for staff signup.";

    await recordFail(ip, userAgent, email || "unknown", msg);
    return jsonFail(msg, 400, Object.keys(fe2).length ? fe2 : undefined);
  }

  const willTeach = resolved.roleName === "TEACHER" ? true : teachesFlag;

  let phase: TeacherPhase | null = null;
  let classLevel = "";
  let canonicalJhs: CanonicalJhsAssignment[] | null = null;

  if (willTeach) {
    const phaseRaw = cleanStr((body as any).phase);
    phase = isTeacherPhase(phaseRaw) ? (phaseRaw as TeacherPhase) : null;

    if (!phase) {
      await recordFail(ip, userAgent, email || "unknown", "VALIDATION_FAILED");
      return jsonFail("VALIDATION_FAILED", 400, { phase: "Phase is required." });
    }

    classLevel =
      phase === "KG" || phase === "PRIMARY"
        ? normalizeTeacherClassLevel(phase, (body as any).classLevel) ?? ""
        : "";

    if (phase === "KG" || phase === "PRIMARY") {
      if (!classLevel) {
        await recordFail(ip, userAgent, email || "unknown", "VALIDATION_FAILED");
        return jsonFail("VALIDATION_FAILED", 400, {
          classLevel: "Use KG 1, KG 2, or B1-B6.",
        });
      }
    } else if (phase === "JHS") {
      const assignments = normalizeAssignments((body as any).jhsAssignments);
      const c = await canonicalizeJhsAssignmentsOrFail(assignments);
      if (!c.ok) {
        await recordFail(ip, userAgent, email || "unknown", "VALIDATION_FAILED");
        return jsonFail("VALIDATION_FAILED", 400, c.fieldErrors);
      }
      canonicalJhs = c.items;
    }
  }

  try {
    const now = new Date();

    const out = await prisma.$transaction(
      async (tx) => {
        const tenantId = resolved.tenantId;
        const roleId = resolved.roleId;
        const roleName = resolved.roleName;

        const existingUser = await tx.user.findUnique({
          where: { email },
          select: { id: true, passwordHash: true },
        });

        let userId: string;

        if (existingUser?.id) {
          if (!existingUser.passwordHash) throw new Error("ACCOUNT_EXISTS_NO_PASSWORD");
          await verifyExistingPasswordOrThrow(password, existingUser.passwordHash);
          await upgradeLegacyHashIfNeeded(tx, existingUser.id, password, existingUser.passwordHash);

          userId = existingUser.id;

          await tx.user.update({
            where: { id: userId },
            data: {
              firstName,
              lastName,
              name: [firstName, lastName].filter(Boolean).join(" ") || null,
              phone,
              phoneNorm: phone,
              lastActiveTenantId: tenantId,
            },
          });
        } else {
          const passwordHash = await hashPassword(password);
          const created = await tx.user.create({
            data: {
              email,
              passwordHash,
              firstName,
              lastName,
              name: [firstName, lastName].filter(Boolean).join(" ") || null,
              phone,
              phoneNorm: phone,
              lastActiveTenantId: tenantId,
            },
            select: { id: true },
          });
          userId = created.id;
        }

        const staffCollision = await tx.membership.findFirst({
          where: { tenantId, staffIdNorm },
          select: { id: true, userId: true },
        });
        if (staffCollision && staffCollision.userId !== userId) throw new Error("STAFF_ID_TAKEN");

        const existingMembership = await tx.membership.findUnique({
          where: { userId_tenantId: { userId, tenantId } },
          select: { id: true, roleId: true, status: true, staffIdNorm: true, staffId: true },
        });

        if (existingMembership) {
          if (existingMembership.status !== "ACTIVE") throw new Error("MEMBERSHIP_NOT_ACTIVE");
          if (existingMembership.roleId !== roleId) throw new Error("ALREADY_MEMBER_DIFFERENT_ROLE");

          const existingNorm = cleanStr(existingMembership.staffIdNorm);
          if (existingNorm && existingNorm !== staffIdNorm) throw new Error("STAFF_ID_LOCKED");

          if (!existingNorm) {
            await tx.membership.update({
              where: { id: existingMembership.id },
              data: { staffId, staffIdNorm },
            });
          } else if (!cleanStr(existingMembership.staffId)) {
            await tx.membership.update({
              where: { id: existingMembership.id },
              data: { staffId },
            });
          }
        } else {
          await tx.membership.create({
            data: { userId, tenantId, roleId, status: "ACTIVE", staffId, staffIdNorm },
          });
        }

        if (resolved.method === "INVITE_CODE") {
          const claimed = await tx.inviteCode.updateMany({
            where: {
              id: resolved.inviteCode.id,
              revokedAt: null,
              expiresAt: { gt: now },
              usedCount: { lt: resolved.inviteCode.maxUses },
            },
            data: { usedCount: { increment: 1 }, lastUsedAt: now },
          });
          if (claimed.count !== 1) throw new Error("INVALID_OR_EXPIRED_CODE");

          await tx.inviteCodeUse.create({
            data: {
              inviteCodeId: resolved.inviteCode.id,
              tenantId: resolved.inviteCode.tenantId,
              userId,
              ip,
              userAgent,
            },
          });
        } else if (resolved.method === "INVITE") {
          const updated = await tx.invite.updateMany({
            where: { id: resolved.inviteRowId, acceptedAt: null, expiresAt: { gt: now } },
            data: { acceptedAt: now },
          });
          if (updated.count !== 1) throw new Error("INVALID_OR_EXPIRED_INVITE");
        }

        if (willTeach) {
          const existingProfile = await tx.teacherProfile.findUnique({
            where: { teacherProfile_tenant_user_unique: { tenantId, userId } },
            select: {
              id: true,
              phase: true,
              classLevel: true,
              jhsAssignments: true,
              primaryClassroomId: true,
            },
          });

          const additionalDuties = Array.isArray((body as any).additionalDuties)
            ? ((body as any).additionalDuties as unknown[])
                .map((x) => cleanStr(x))
                .filter(Boolean)
            : [];

          let primaryClassroomId: string | null = existingProfile?.primaryClassroomId ?? null;

          if (!existingProfile) {
            const createdProfile = await tx.teacherProfile.create({
              data: {
                tenantId,
                userId,
                phone,
                phase: phase as any,
                ...(phase === "KG" || phase === "PRIMARY" ? { classLevel } : {}),
                ...(phase === "JHS" ? { jhsAssignments: canonicalJhs as any } : {}),
                additionalDuties,
              },
              select: {
                primaryClassroomId: true,
              },
            });

            primaryClassroomId = createdProfile.primaryClassroomId ?? null;
          } else {
            if (String(existingProfile.phase) !== String(phase)) {
              throw new Error("SCOPE_ALREADY_LOCKED");
            }

            const existingClassLevel =
              phase === "KG" || phase === "PRIMARY"
                ? normalizeTeacherClassLevel(phase, existingProfile.classLevel)
                : null;

            if (
              (phase === "KG" || phase === "PRIMARY") &&
              existingClassLevel !== classLevel
            ) {
              throw new Error("SCOPE_ALREADY_LOCKED");
            }

            if (phase === "JHS") {
              const prevN = normalizeJhsAssignmentsForCompare(existingProfile.jhsAssignments);
              const nextN = normalizeJhsAssignmentsForCompare(canonicalJhs as any);
              if (JSON.stringify(prevN) !== JSON.stringify(nextN)) {
                throw new Error("SCOPE_ALREADY_LOCKED");
              }
            }

            await tx.teacherProfile.update({
              where: { id: existingProfile.id },
              data: {
                phone,
                additionalDuties,
              },
            });
          }

          await replaceTeacherAssessmentAssignmentsForProfile({
            tx,
            tenantId,
            teacherUserId: userId,
            phase: phase as any,
            classLevel: phase === "KG" || phase === "PRIMARY" ? classLevel : null,
            primaryClassroomId,
            jhsAssignments:
              phase === "JHS" && canonicalJhs
                ? canonicalJhs.map((a) => ({
                    subject: a.subject,
                    classes: a.classes,
                  }))
                : [],
            createdByUserId: userId,
            reason: "Teacher assessment assignments created during teacher signup.",
          });
        }

        const action = roleName === "HEADTEACHER" ? "HEADTEACHER_SIGNUP" : "TEACHER_SIGNUP";

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action,
            resource: "User",
            resourceId: userId,
            ip,
            userAgent,
            metadata: {
              roleName,
              method: resolved.method,
              teaches: willTeach,
              phase: willTeach ? phase : null,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        return { tenantId, roleName, userId };
      },
      { maxWait: 10_000, timeout: 30_000 }
    );

    const portalUrl = `/auth/signin?callbackUrl=${encodeURIComponent(redirectTo)}`;
    return jsonOk({ ok: true, portalUrl, tenantId: out.tenantId, userId: out.userId });
  } catch (err: any) {
    const msg = String(err?.message || "ERR");
    await recordFail(ip, userAgent, email || "unknown", msg);

    if (msg === "INVALID_OR_EXPIRED_CODE") return jsonFail("INVALID_OR_EXPIRED_CODE", 400, { inviteCode: "Invalid or expired code." });
    if (msg === "INVALID_OR_EXPIRED_INVITE") return jsonFail("INVALID_OR_EXPIRED_INVITE", 400, { inviteToken: "Invalid or expired invite." });
    if (msg === "INVITE_EMAIL_MISMATCH") return jsonFail("INVITE_EMAIL_MISMATCH", 400, { email: "Use the same email that was invited." });

    if (msg === "TENANT_NOT_ACTIVE") return jsonFail("TENANT_NOT_ACTIVE", 403);

    if (msg === "ACCOUNT_EXISTS_NO_PASSWORD") return jsonFail("ACCOUNT_EXISTS_NO_PASSWORD", 409);
    if (msg === "ACCOUNT_EXISTS_BAD_PASSWORD") return jsonFail("ACCOUNT_EXISTS_BAD_PASSWORD", 401, { password: "Incorrect password." });

    if (msg === "STAFF_ID_TAKEN") return jsonFail("STAFF_ID_TAKEN", 409, { staffId: "This Staff ID is already used in this school." });
    if (msg === "MEMBERSHIP_NOT_ACTIVE") return jsonFail("MEMBERSHIP_NOT_ACTIVE", 403);
    if (msg === "ALREADY_MEMBER_DIFFERENT_ROLE") return jsonFail("ALREADY_MEMBER_DIFFERENT_ROLE", 403);
    if (msg === "STAFF_ID_LOCKED") return jsonFail("STAFF_ID_LOCKED", 409, { staffId: "Staff ID is already locked for this account in this school." });
    if (msg === "SCOPE_ALREADY_LOCKED") return jsonFail("SCOPE_ALREADY_LOCKED", 409);

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      if (prismaTargetIncludes(err, "phoneNorm")) return jsonFail("PHONE_ALREADY_USED", 409, { phone: "This phone number is already used by another account." });
      if (prismaTargetIncludes(err, "staffIdNorm") || prismaTargetIncludes(err, "Membership_tenant_staffIdNorm_unique")) {
        return jsonFail("STAFF_ID_TAKEN", 409, { staffId: "This Staff ID is already used in this school." });
      }
      return jsonFail("DUPLICATE_CONSTRAINT", 409);
    }

    console.error("teacher-signup error:", err);
    return jsonFail("FAILED", 500);
  }
}
