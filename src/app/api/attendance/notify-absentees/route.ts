// src/app/api/attendance/notify-absentees/route.ts
import { NextResponse } from "next/server";
import { sendViaHubtel, type BrandName } from "@/lib/sms/hubtel";
import { prisma } from "@/lib/prisma";

/**
 * We keep the fever threshold the same as on the UI.
 * This is duplicated here instead of imported from the client to keep
 * the server route self-contained and type-safe.
 */
const FEVER_THRESHOLD = 37.8;

type AlertStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

type AlertCandidatePayload = {
  studentId: string;
  studentName: string;
  status: AlertStatus;
  temperatureC?: number;
  symptoms?: string;
  isFever?: boolean;
};

type NotifyRequestBody = {
  tenantId?: string;
  classroomId?: string;
  date?: string; // YYYY-MM-DD
  classLabel?: string;
  alerts?: AlertCandidatePayload[];
};

type SessionState = "NONE" | "OPEN" | "CLOSED" | "CERTIFIED";

/**
 * Server-side integrity check:
 * Look up the attendance session in the DB and ensure it is CLOSED or CERTIFIED
 * before allowing any SMS alerts to be sent.
 */
async function getSessionState(
  tenantId: string,
  classroomId: string,
  date: string
): Promise<SessionState> {
  try {
    // We intentionally go via `any` to avoid tight coupling
    // to the generated Prisma types. This keeps TS happy even
    // if the model name or fields evolve slightly.
    const client: any = prisma as any;

    if (
      !client.attendanceSession ||
      typeof client.attendanceSession.findFirst !== "function"
    ) {
      console.warn(
        "[ATTENDANCE_NOTIFY_SESSION_WARN] prisma.attendanceSession.findFirst is not available. " +
          "Defaulting to OPEN for safety (no SMS will be sent)."
      );
      return "OPEN";
    }

    // NOTE: Your AttendanceSession model uses `date` (DateTime), not `sessionDate`.
    // We mirror the other attendance APIs: match by tenantId, classroomId, and this Date.
    const session = await client.attendanceSession.findFirst({
      where: {
        tenantId,
        classroomId,
        date: new Date(date),
      },
      orderBy: { createdAt: "desc" },
    });

    if (!session) {
      return "NONE";
    }

    if (session.certifiedAt) {
      return "CERTIFIED";
    }

    if (session.isClosed) {
      return "CLOSED";
    }

    return "OPEN";
  } catch (err) {
    console.error("[ATTENDANCE_NOTIFY_SESSION_LOOKUP_ERROR]", err);
    // Fail-safe: treat it as OPEN so we *block* sending alerts.
    return "OPEN";
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NotifyRequestBody;

    const tenantId = body.tenantId?.trim();
    const classroomId = body.classroomId?.trim();
    const date = body.date?.trim();
    const classLabel = (body.classLabel || "").trim();
    const alerts = Array.isArray(body.alerts) ? body.alerts : [];

    if (!tenantId || !classroomId || !date) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing tenantId, classroomId, or date. Please choose a class and date, then try again.",
        },
        { status: 400 }
      );
    }

    if (!alerts.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "There are no absentees or fever cases in this session. No SMS will be sent.",
        },
        { status: 400 }
      );
    }

    // Filter again on the server for safety. Even if the client misbehaves,
    // we only send for ABSENT or fever cases.
    const filtered = alerts.filter((a) => {
      const status = a.status || "PRESENT";
      const t = typeof a.temperatureC === "number" ? a.temperatureC : undefined;
      const fever = typeof t === "number" && t >= FEVER_THRESHOLD;
      const isFever = typeof a.isFever === "boolean" ? a.isFever : fever;
      return status === "ABSENT" || isFever;
    });

    if (!filtered.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "After server checks, there are no valid absentees or fever cases to notify.",
        },
        { status: 400 }
      );
    }

    // 🔐 Server-side integrity check against the attendance session
    const sessionState = await getSessionState(tenantId, classroomId, date);

    if (sessionState !== "CLOSED" && sessionState !== "CERTIFIED") {
      const msg =
        sessionState === "NONE"
          ? "We could not find an attendance session for this date and class. Please open, mark, save, then CLOSE (or CERTIFY) the session before notifying parents."
          : "To protect data integrity, please CLOSE (or CERTIFY) this attendance session for the selected date before notifying parents.";

      return NextResponse.json(
        {
          ok: false,
          error: msg,
        },
        { status: 400 }
      );
    }

    // For now, we route all alerts to your configured TEST_SMS_TO,
    // so we don't accidentally message real guardians while still building.
    const TEST_SMS_TO = process.env.TEST_SMS_TO || "";
    if (!TEST_SMS_TO) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "TEST_SMS_TO is not configured in env. Please set TEST_SMS_TO and try again.",
        },
        { status: 500 }
      );
    }

    // Default brand for attendance alerts. Later, we can decide KG/Primary/JHS mapping.
    const brand: BrandName = "AYITIKOPJHS";

    const results: {
      studentName: string;
      status: AlertStatus;
      temperatureC?: number;
      symptoms?: string;
      ok: boolean;
      to?: string;
      error?: string;
    }[] = [];

    let successCount = 0;

    for (const a of filtered) {
      const status = a.status || "PRESENT";
      const t = typeof a.temperatureC === "number" ? a.temperatureC : undefined;
      const isFever =
        typeof a.isFever === "boolean"
          ? a.isFever
          : typeof t === "number" && t >= FEVER_THRESHOLD;

      // Build gentle, non-shaming message.
      // NOTE: This is still using TEST_SMS_TO. In production, we will replace
      // the `to` field with the real guardian phone number from DB.
      const dateForText = date;
      const safeClass = classLabel || "your child's class";

      let lineStatus = "";
      if (status === "ABSENT") {
        lineStatus = `${a.studentName} was ABSENT from ${safeClass} today (${dateForText}).`;
      } else if (isFever && typeof t === "number") {
        // Use ASCII-only "deg C" to avoid weird symbols in SMS
        lineStatus = `${a.studentName} was present but recorded a temperature of ${t.toFixed(
          1
        )} deg C in ${safeClass} on ${dateForText}.`;
      } else {
        lineStatus = `${a.studentName}'s attendance was recorded in ${safeClass} on ${dateForText}.`;
      }

      let lineSymptoms = "";
      if (a.symptoms && a.symptoms.trim().length > 0) {
        lineSymptoms = ` Reported symptoms: ${a.symptoms.trim()}.`;
      }

      const baseMessage =
        "Dear Parent/Guardian, this is Ayitikope M/A Basic School.";
      const closing =
        " This message is for your awareness only. Please check on your child and contact the class teacher if you have any questions. Thank you.";

      const bodyText = `${baseMessage} ${lineStatus}${lineSymptoms}${closing}`;

      try {
        const sendResult = await sendViaHubtel({
          to: TEST_SMS_TO,
          body: bodyText,
          tenantId,
          brand,
          meta: {
            purpose: "attendance_health_alert",
            type: "ATTENDANCE_HEALTH",
            studentId: a.studentId,
            studentName: a.studentName,
            status,
            temperatureC: t ?? null,
            symptoms: a.symptoms || null,
            classroomId,
            date,
          },
        });

        if (sendResult.ok) {
          successCount += 1;
        }

        results.push({
          studentName: a.studentName,
          status,
          temperatureC: t,
          symptoms: a.symptoms,
          ok: sendResult.ok,
          to: sendResult.to,
          error: sendResult.ok ? undefined : "Hubtel send reported failure.",
        });
      } catch (err: any) {
        console.error("[ATTENDANCE_NOTIFY_ERROR]", err);
        results.push({
          studentName: a.studentName,
          status,
          temperatureC: t,
          symptoms: a.symptoms,
          ok: false,
          error:
            err?.message ||
            "Unexpected error while sending attendance/health alert.",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      total: filtered.length,
      successCount,
      brand,
      date,
      classLabel,
      results,
    });
  } catch (err: any) {
    console.error("[ATTENDANCE_NOTIFY_FATAL]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Unexpected error while processing attendance notifications.",
      },
      { status: 500 }
    );
  }
}
