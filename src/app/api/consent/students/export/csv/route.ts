// src/app/api/consent/students/export/csv/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  // If it contains a quote, comma, or newline, wrap in quotes and double the quotes
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toDateOnly(d?: Date | null): string {
  if (!d) return ''
  try {
    return new Date(d).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenantId')?.trim()
    if (!tenantId) {
      return new Response('tenantId is required', { status: 400 })
    }

    // Optional: filter by classroomId if provided
    const classroomId = searchParams.get('classroomId')?.trim() || undefined

    const students = await prisma.student.findMany({
      where: {
        tenantId,
        ...(classroomId ? { classroomId } : {}),
      },
      include: {
        classroom: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    // Build CSV
    const headers = [
      'studentId',
      'firstName',
      'lastName',
      'classroom',
      'guardianName',
      'guardianPhone',
      'healthConsentAt',
      'guardianSmsOptIn',
      'note',
      'createdAt',
      'updatedAt',
    ]

    const rows = students.map((s) => [
      csvEscape(s.id),
      csvEscape(s.firstName),
      csvEscape(s.lastName),
      csvEscape(s.classroom?.name ?? ''),
      csvEscape(s.guardianName ?? ''),
      csvEscape(s.guardianPhone ?? ''),
      csvEscape(toDateOnly(s.healthConsentAt)),
      csvEscape(s.guardianSmsOptIn ? 'True' : 'False'),
      csvEscape(s.note ?? ''),
      csvEscape(toDateOnly(s.createdAt)),
      csvEscape(toDateOnly(s.updatedAt)),
    ])

    // Join with CRLF for best Excel compatibility
    const csv =
      headers.map(csvEscape).join(',') +
      '\r\n' +
      rows.map((r) => r.join(',')).join('\r\n')

    const fname = `students-consent-${new Date().toISOString().slice(0, 10)}.csv`
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${fname}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    console.error('students/export/csv error:', err)
    return new Response('Failed to export students CSV', { status: 500 })
  }
}
