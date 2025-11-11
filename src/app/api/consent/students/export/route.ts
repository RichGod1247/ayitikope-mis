// src/app/api/consent/students/export/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = (searchParams.get('tenantId') || '').trim();
    if (!tenantId) {
      return new Response('tenantId is required', { status: 400 });
    }

    const students = await prisma.student.findMany({
      where: { tenantId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        guardianSmsOptIn: true,
        healthConsentAt: true,
        classroom: { select: { grade: true, arm: true } },
      },
    });

    const header = [
      'studentId',
      'firstName',
      'lastName',
      'class',
      'guardianName',
      'guardianPhone',
      'guardianSmsOptIn',
      'healthConsentAt',
    ];

    const lines = [header.join(',')];
    for (const s of students) {
      const classLabel =
        (s.classroom?.grade || '') + (s.classroom?.arm ? s.classroom?.arm : '');
      lines.push(
        [
          s.id,
          s.firstName,
          s.lastName,
          classLabel,
          s.guardianName ?? '',
          s.guardianPhone ?? '',
          s.guardianSmsOptIn ? 'true' : 'false',
          s.healthConsentAt ? s.healthConsentAt.toISOString() : '',
        ]
          .map(csvEscape)
          .join(',')
      );
    }

    const csv = lines.join('\n');
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="student-consents.csv"',
      },
    });
  } catch (err) {
    console.error('consent/students/export error:', err);
    return new Response('Failed to export students', { status: 500 });
  }
}
