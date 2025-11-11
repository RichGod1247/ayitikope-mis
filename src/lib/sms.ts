// src/lib/sms.ts
import { prisma } from '@/lib/prisma'

type SMSInput = {
  to: string            // phone (preferred) — but string is fine for now
  message: string
  tenantId: string      // required by SMSSendAudit
  kind?: 'student-health' | 'teacher-weekly-reminder' | 'generic' // not persisted (yet)
  meta?: Record<string, any>                                      // not persisted (yet)
}

/**
 * Stubbed SMS sender + audit.
 * Writes only fields that exist in your current SMSSendAudit schema.
 */
export async function sendSMS({ to, message, tenantId }: SMSInput) {
  // Simulate provider
  console.log('[SMS-STUB]', { to, message })

  // Best-effort audit (don’t block on failures)
  try {
    await prisma.sMSSendAudit.create({
      data: {
        tenantId,
        toPhone: to,   // <-- REQUIRED by your schema
        // intentionally NOT saving message/meta/kind since those columns don’t exist
      },
    })
  } catch (e) {
    console.warn('SMS audit insert failed (non-fatal):', e)
  }
}
