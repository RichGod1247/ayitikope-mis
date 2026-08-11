import { NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  readTeacherSupervisoryReleasedResultDiscovery,
} from "@/lib/appraisals/teacherSupervisoryReleasedResultDiscovery";
import {
  TeacherSupervisoryReleasedResultError,
} from "@/lib/appraisals/teacherSupervisoryReleasedResult";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function applyNoStoreHeaders(headers: Headers) {
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return headers;
}

function jsonNoStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: applyNoStoreHeaders(new Headers()),
  });
}

function authResponseNoStore(response: Response) {
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: applyNoStoreHeaders(new Headers(response.headers)),
  });
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER"],
  });

  if (!auth.ok) {
    return authResponseNoStore(auth.res);
  }

  const actorUserId = clean(auth.ctx.userId);
  const actorTenantId = clean(auth.ctx.tenantId);

  if (!actorUserId || !actorTenantId) {
    return jsonNoStore(403, {
      ok: false,
      error: "TEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_AUTH_CONTEXT_INVALID",
    });
  }

  try {
    const result = await readTeacherSupervisoryReleasedResultDiscovery({
      actorUserId,
      actorRoleName: "TEACHER",
      actorTenantId,
    });

    return jsonNoStore(200, {
      ok: true,
      items: result.items,
    });
  } catch (error) {
    if (error instanceof TeacherSupervisoryReleasedResultError) {
      return jsonNoStore(error.status, {
        ok: false,
        error: error.code,
      });
    }

    return jsonNoStore(500, {
      ok: false,
      error: "TEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_FAILED",
    });
  }
}
