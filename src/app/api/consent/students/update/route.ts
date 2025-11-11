// src/app/api/consent/students/update/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

type Body = {
  studentId?: string;
  smsOptIn?: boolean;
  healthConsentAt?: string | null; // ISO | "NOW" | null | undefined
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    const studentId = (body.studentId || '').trim();
    if (!studentId) {
      return new Response(JSON.stringify({ error: 'studentId is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Fetch the student to validate existence (and to avoid passing undefined tenant/classroom)
    const current = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        tenantId: true,
        classroomId: true,
        guardianName: true,
        guardianPhone: true,
        // These fields must exist in your Prisma schema (we added them earlier)
        healthConsentAt: true,
        guardianSmsOptIn: true,
      },
    });

    if (!current) {
      return new Response(JSON.stringify({ error: 'Student not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Build the update payload surgically
    const data: any = {};

    // Map smsOptIn -> guardianSmsOptIn only if provided
    if (typeof body.smsOptIn === 'boolean') {
      data.guardianSmsOptIn = body.smsOptIn;
    }

    // healthConsentAt handling
    if (body.hasOwnProperty('healthConsentAt')) {
      const v = body.healthConsentAt;
      if (v === null) {
        data.healthConsentAt = null; // clear
      } else if (typeof v === 'string') {
        if (v.toUpperCase() === 'NOW') {
          data.healthConsentAt = new Date();
        } else {
          const d = new Date(v);
          if (isNaN(d.getTime())) {
            return new Response(JSON.stringify({ error: 'healthConsentAt must be ISO date string, "NOW", or null' }), {
              status: 400,
              headers: { 'content-type': 'application/json' },
            });
          }
          data.healthConsentAt = d;
        }
      }
      // if undefined, do not set (leave unchanged)
    }

    if (Object.keys(data).length === 0) {
      // Nothing to update—treat as success to avoid noisy failures
      return new Response(JSON.stringify({ ok: true, unchanged: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data,
      select: {
        id: true,
        guardianSmsOptIn: true,
        healthConsentAt: true,
      },
    });

    return new Response(JSON.stringify({ ok: true, student: updated }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('consent/students/update error:', err);
    return new Response(JSON.stringify({ error: 'Failed to update student consent' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
