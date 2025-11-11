// src/app/api/consent/students/detail/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const studentId = String(searchParams.get('studentId') || '').trim()
    if (!studentId) return new Response(JSON.stringify({ error: 'studentId is required' }), { status: 400 })

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true, firstName: true, lastName: true,
        guardianName: true, guardianPhone: true,
        healthConsentAt: true, guardianSmsOptIn: true,
        classroom: { select: { grade: true, arm: true, name: true } },
      }
    })
    return new Response(JSON.stringify({ student }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (e) {
    console.error('consent/students/detail error:', e)
    return new Response(JSON.stringify({ error: 'Failed to load student' }), { status: 500 })
  }
}
