//src/app/api/consent/export/students/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

function csvEscape(s: any) {
  const v = s == null ? '' : String(s)
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = (searchParams.get('tenantId') || '').trim()
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    const students = await prisma.student.findMany({
      where: { tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        classroomId: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    const header = [
      'studentId',
      'firstName',
      'lastName',
      'guardianName',
      'guardianPhone',
      'classroomId',
    ]

    const rows = students.map(s => [
      s.id, s.firstName, s.lastName, s.guardianName, s.guardianPhone, s.classroomId,
    ].map(csvEscape).join(','))

    const csv = [header.join(','), ...rows].join('\n')
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="students_${tenantId}.csv"`,
      },
    })
  } catch (err) {
    console.error('export/students error:', err)
    return new Response('Failed to export students CSV', { status: 500 })
  }
}
