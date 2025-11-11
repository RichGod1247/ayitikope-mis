// src/app/api/attendance/sessions/export-csv/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// Helper: ensure YYYY-MM-DD
function toISODateOnly(input?: string): string | null {
  if (!input) return null
  const d = new Date(input)
  if (isNaN(d.getTime())) return null
  // Normalize to date-only in ISO (UTC)
  return d.toISOString().slice(0, 10)
}

// GET /api/attendance/sessions/export-csv?tenantId=...&classroomId=...&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    const classroomId = String(searchParams.get('classroomId') || '').trim()
    const dateRaw = String(searchParams.get('date') || '').trim()
    const date = toISODateOnly(dateRaw) ?? new Date().toISOString().slice(0, 10) // default: today

    if (!tenantId || !classroomId) {
      return new Response('tenantId and classroomId are required', { status: 400 })
    }

    // 1) Find the session for that (tenant, class, date)
    // Using raw query to match date (ignoring time) reliably.
    const sessionRows = await prisma.$queryRaw<
      Array<{ id: string; isClosed: boolean | null; certifiedAt: Date | null }>
    >`
      SELECT s."id", s."isClosed", s."certifiedAt"
      FROM "edulife_os"."AttendanceSession" s
      WHERE s."tenantId" = ${tenantId}
        AND s."classroomId" = ${classroomId}
        AND s."date"::date = ${date}::date
      LIMIT 1
    `
    if (!sessionRows.length) {
      return new Response('Session not found for given tenantId/classroomId/date', { status: 404 })
    }
    const session = sessionRows[0]

    // 2) Pull class label & tenant name for header
    const metaRows = await prisma.$queryRaw<
      Array<{ tenantName: string; classGrade: string | null; classArm: string | null }>
    >`
      SELECT t."name" AS "tenantName", c."grade" AS "classGrade", c."arm" AS "classArm"
      FROM "edulife_os"."Tenant" t
      JOIN "edulife_os"."Classroom" c ON c."tenantId" = t."id"
      WHERE t."id" = ${tenantId} AND c."id" = ${classroomId}
      LIMIT 1
    `
    const tenantName = metaRows[0]?.tenantName ?? ''
    const classGrade = metaRows[0]?.classGrade ?? ''
    const classArm = metaRows[0]?.classArm ?? ''
    const classLabel = classArm ? `${classGrade}${classArm}` : classGrade

    // 3) Students + marks (LEFT JOIN so unmarked show empty)
    const rows = await prisma.$queryRaw<
      Array<{ studentId: string; lastName: string; firstName: string; status: string | null; note: string | null }>
    >`
      SELECT st."id"            AS "studentId",
             st."lastName"      AS "lastName",
             st."firstName"     AS "firstName",
             m."status"         AS "status",
             m."note"           AS "note"
      FROM "edulife_os"."Student" st
      LEFT JOIN "edulife_os"."AttendanceMark" m
        ON m."studentId" = st."id" AND m."sessionId" = ${session.id}
      WHERE st."classroomId" = ${classroomId}
      ORDER BY st."lastName" ASC, st."firstName" ASC
    `

    // 4) Build CSV (simple, Excel-friendly)
    const esc = (v: any) => {
      const s = (v ?? '').toString()
      // double quotes doubled for CSV safety
      const needsQuotes = /[",\n]/.test(s)
      return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s
    }

    const headerLines = [
      `School,${esc(tenantName)}`,
      `Class,${esc(classLabel)}`,
      `Date,${esc(date)}`,
      `Status,${session.isClosed ? (session.certifiedAt ? 'CLOSED & CERTIFIED' : 'CLOSED') : 'OPEN'}`,
      ``,
    ]

    const tableHeader = ['StudentID', 'LastName', 'FirstName', 'Status', 'Note'].map(esc).join(',')
    const tableRows = rows.map(r =>
      [r.studentId, r.lastName, r.firstName, r.status ?? '', r.note ?? ''].map(esc).join(',')
    )

    const csv = [...headerLines, tableHeader, ...tableRows].join('\r\n')

    const filename = `attendance_${classLabel || 'class'}_${date}.csv`.replace(/\s+/g, '_')

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (err: any) {
    console.error('export-csv error:', err)
    return new Response('Failed to export CSV', { status: 500 })
  }
}
