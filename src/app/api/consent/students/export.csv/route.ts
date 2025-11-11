// src/app/api/consent/students/export.csv/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = String(searchParams.get('tenantId') || '').trim()
    if (!tenantId) {
      return new Response('tenantId is required', { status: 400 })
    }

    const students = await prisma.student.findMany({
      where: { tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        healthConsentAt: true,
        guardianSmsOptIn: true,
        classroom: { select: { grade: true, arm: true, name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    const lines: string[] = []
    lines.push([
      'studentId',
      'firstName',
      'lastName',
      'class',
      'guardianName',
      'guardianPhone',
      'healthConsentAt',
      'guardianSmsOptIn',
    ].join(','))

    for (const s of students) {
      const cls = s.classroom
        ? (s.classroom.grade ? `${s.classroom.grade}${s.classroom.arm ?? ''}` : s.classroom.name)
        : ''
      lines.push([
        s.id,
        s.firstName ?? '',
        s.lastName ?? '',
        cls ?? '',
        s.guardianName ?? '',
        s.guardianPhone ?? '',
        s.healthConsentAt ? new Date(s.healthConsentAt).toISOString() : '',
        s.guardianSmsOptIn ? 'true' : 'false',
      ].map(v => `"${String(v).replaceAll('"','""')}"`).join(','))
    }

    const csv = lines.join('\r\n')
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="students-consent.csv"`,
      },
    })
  } catch (e) {
    console.error('students/export.csv error:', e)
    return new Response('Failed to export students', { status: 500 })
  }
}
