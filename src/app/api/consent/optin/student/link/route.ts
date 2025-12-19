import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenantId')?.trim()
    const studentId = searchParams.get('studentId')?.trim()

    if (!tenantId || !studentId) {
      return new Response(JSON.stringify({ ok: false, error: 'tenantId and studentId are required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      })
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true, tenantId: true,
        firstName: true, lastName: true,
        guardianSmsOptIn: true, healthConsentAt: true,
      },
    })
    if (!student || student.tenantId !== tenantId) {
      return new Response(JSON.stringify({ ok: false, error: 'Student not found' }), {
        status: 404, headers: { 'content-type': 'application/json' },
      })
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: {
        guardianSmsOptIn: true,
        healthConsentAt: student.healthConsentAt ?? new Date(),
      },
      select: {
        id: true, firstName: true, lastName: true,
        guardianSmsOptIn: true, healthConsentAt: true,
      },
    })

    // optional audit into your AuditLog table if you wish (action: CONSENT_STUDENT_UPDATE)
    // await prisma.auditLog.create({ ... })

    // Simple confirmation page (HTML) so guardians see success on tap
    const html = `
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Opt-in confirmed</title></head>
<body style="font-family: system-ui; max-width: 560px; margin: 40px auto; line-height: 1.5;">
  <h1>Thank you!</h1>
  <p>Consent & SMS updates are now enabled for <strong>${updated.lastName} ${updated.firstName}</strong>.</p>
  <p>Date: ${updated.healthConsentAt ? new Date(updated.healthConsentAt).toLocaleString() : ''}</p>
  <p>You may close this page.</p>
</body>
</html>`
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    console.error('optin link error:', err)
    return new Response(JSON.stringify({ ok: false, error: 'Failed to confirm' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    })
  }
}
