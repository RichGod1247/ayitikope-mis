// src/app/api/health/student/daily/upsert/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSMS } from '@/lib/sms'

type IncomingItem = {
  studentId: string
  date: string // ISO YYYY-MM-DD (preferred) or parseable date
  temperatureC?: number | null
  symptoms?: string | null
  notes?: string | null
  tenantId?: string // optional hint from UI
  classroomId?: string // optional hint from UI
}

function toDateOnly(input: string): Date {
  const d = new Date(input)
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`)
  const iso = d.toISOString().slice(0, 10)
  return new Date(`${iso}T00:00:00.000Z`)
}

function hasSmsConsentFromNote(note?: string | null): boolean {
  if (!note) return false
  return /\[consent:\s*sms\]/i.test(note)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || !Array.isArray(body.items)) {
      return new Response(JSON.stringify({ error: 'Invalid payload: { items: [...] } required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    const items: IncomingItem[] = body.items
    if (items.length === 0) {
      return new Response(JSON.stringify({ saved: 0, smsQueued: 0, skipped: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    let saved = 0
    let smsQueued = 0
    let skipped = 0

    // Process sequentially to reduce pool pressure
    for (const it of items) {
      const { studentId } = it
      if (!studentId) { skipped++; continue }

      let dateOnly: Date
      try {
        dateOnly = toDateOnly(it.date)
      } catch {
        skipped++
        continue
      }

      // Fetch student first to derive required fields
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          tenantId: true,
          classroomId: true,
          firstName: true,
          lastName: true,
          guardianPhone: true,
          note: true,
        },
      })

      if (!student) { skipped++; continue }

      // Resolve required strings (schema requires non-null)
      const tenantId = (it.tenantId ?? student.tenantId)?.trim()
      const classroomId = (it.classroomId ?? student.classroomId ?? '')?.trim()

      if (!tenantId || !classroomId) {
        // Cannot create due to schema non-null constraints
        skipped++
        continue
      }

      const data = {
        tenantId,
        classroomId,
        studentId,
        date: dateOnly,
        temperatureC: typeof it.temperatureC === 'number' ? it.temperatureC : null,
        symptoms: it.symptoms ?? null,
        notes: it.notes ?? null,
      }

      await prisma.studentHealthDaily.upsert({
        where: { StudentHealthDaily_unique_student_date: { studentId, date: dateOnly } },
        // On update we also refresh tenant/classroom to keep it consistent with current enrollment
        update: data,
        create: data,
        select: { id: true },
      })

      saved += 1

      // Consent + SMS (from student.note token and phone present)
      const consent = hasSmsConsentFromNote(student.note)
      const phone = (student.guardianPhone || '').trim()

      if (consent && phone) {
        const fullName = [student.firstName, student.lastName].filter(Boolean).join(' ')
        const dayStr = dateOnly.toISOString().slice(0, 10)
        const tempPart =
          typeof it.temperatureC === 'number'
            ? `Temp ${it.temperatureC.toFixed(1)}°C`
            : 'Temp N/A'
        const symptomsPart = it.symptoms?.trim() ? `; Symptoms: ${it.symptoms.trim()}` : ''
        const msg = `Ayitikope M/A: ${fullName} health for ${dayStr} — ${tempPart}${symptomsPart}. If unwell, please follow up.`
        try {
          await sendSMS({
            to: phone,
            message: msg,
            tenantId,                     // <-- REQUIRED for audit insert
            // kind: 'student-health',    // optional, not persisted yet
            // meta: { studentId, classroomId, date: dayStr }, // optional, not persisted
          })
          smsQueued += 1
        } catch {
          // swallow SMS errors; optional: log
        }
      }
    }

    return new Response(JSON.stringify({ saved, smsQueued, skipped }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err: any) {
    console.error('student/daily/upsert error:', err)
    return new Response(JSON.stringify({ error: 'Failed to upsert student health' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
