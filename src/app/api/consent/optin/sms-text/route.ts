// src/app/api/consent/optin/sms-text/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function originFromEnv() {
  const o = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '')
  return o || `http://localhost:${process.env.PORT || 3000}`
}

/**
 * GET /api/consent/optin/sms-text?tenantId=...&studentId=...
 * Returns: { text: "..." }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenantId')?.trim()
    const studentId = searchParams.get('studentId')?.trim()

    if (!tenantId || !studentId) {
      return new Response(JSON.stringify({ error: 'tenantId and studentId are required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Minimal data for personalization
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { firstName: true, lastName: true, guardianName: true },
    })
    if (!student) {
      return new Response(JSON.stringify({ error: 'Student not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    }

    const origin = originFromEnv()
    const letterUrl = `${origin}/headteacher/consent/letters/student/${encodeURIComponent(studentId)}`
    const child = [student.firstName, student.lastName].filter(Boolean).join(' ')
    const guardian = student.guardianName || 'Dear Parent/Guardian'

    const text =
`${guardian}, Ayitikope M/A Basic School:
Please review and confirm health & SMS consent for ${child}.
Open this link: ${letterUrl}
Reply YES to opt-in or contact the Head Teacher for help. Thank you.`

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error('optin/sms-text error:', err)
    return new Response(JSON.stringify({ error: 'Failed to build SMS text' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
