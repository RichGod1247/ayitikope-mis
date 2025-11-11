// src/app/teacher/health/weekly/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

function mondayOf(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() // Sun=0..Sat=6
  const back = (day + 6) % 7 // go back to Monday
  d.setUTCDate(d.getUTCDate() - back)
  return d
}
function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

type Teacher = { id: string; name?: string | null; email?: string | null }

export default function TeacherWeeklyHealthPage() {
  // state
  const [tenantId, setTenantId] = useState('')
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [userId, setUserId] = useState('')
  const [weekStart, setWeekStart] = useState('')
  const [stressLevel, setStressLevel] = useState<number>(3)
  const [workload, setWorkload] = useState<number>(3)
  const [comments, setComments] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // init dates (current Monday)
  useEffect(() => {
    const mon = mondayOf(new Date())
    setWeekStart(iso(mon))
  }, [])

  // load default tenant
  useEffect(() => {
    const loadTenant = async () => {
      try {
        const r = await fetch('/api/test/tenants')
        const data = await r.json()
        if (data.tenants?.length) {
          setTenantId(data.tenants[0].id)
        }
      } catch {
        /* ignore */
      }
    }
    loadTenant()
  }, [])

  // load teachers for tenant
  useEffect(() => {
    const run = async () => {
      if (!tenantId) return
      setError(null)
      try {
        const r = await fetch(`/api/test/teachers?tenantId=${encodeURIComponent(tenantId)}`)
        if (!r.ok) throw new Error('Failed to load teachers')
        const data = await r.json()
        const list: Teacher[] = data?.teachers || []
        setTeachers(list)
        if (list.length && !userId) setUserId(list[0].id)
      } catch (e: any) {
        setError(e.message || 'Failed to load teachers')
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  const canSave = useMemo(
    () => !!tenantId && !!userId && !!weekStart && stressLevel >= 1 && workload >= 1,
    [tenantId, userId, weekStart, stressLevel, workload]
  )

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setNotice(null)
    setError(null)
    try {
      // API you already created: /api/health/teacher/weekly/upsert
      const r = await fetch('/api/health/teacher/weekly/upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          userId,
          weekStart, // optional: server will derive if omitted; sending is fine
          stressLevel,
          workload,
          comments: comments.trim() || null,
        }),
      })
      const data = await r.json()
      if (!r.ok || !data?.ok) throw new Error(data?.error || 'Save failed')
      setNotice('Saved 👍 — Headteacher page will now show this week’s entry.')
    } catch (e: any) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Weekly Health (Teacher Self-Report)</h1>
      <p className="text-sm text-neutral-600">
        Fill this once per week. Headteachers can view aggregated records in their dashboard.
      </p>

      <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-neutral-600 mb-1">Tenant</label>
            <input
              className="w-full border rounded-lg p-2"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="tenant id"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-600 mb-1">Teacher</label>
            <select
              className="w-full border rounded-lg p-2"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              {teachers.map(t => (
                <option value={t.id} key={t.id}>
                  {t.name || t.email || t.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-neutral-600 mb-1">Week start (Monday, UTC)</label>
            <input
              type="date"
              className="w-full border rounded-lg p-2"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-600 mb-1">Stress level (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              className="w-full border rounded-lg p-2"
              value={stressLevel}
              onChange={(e) => setStressLevel(parseInt(e.target.value || '0', 10))}
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-600 mb-1">Workload (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              className="w-full border rounded-lg p-2"
              value={workload}
              onChange={(e) => setWorkload(parseInt(e.target.value || '0', 10))}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-neutral-600 mb-1">Comments (optional)</label>
          <textarea
            className="w-full border rounded-lg p-2 min-h-[100px]"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="e.g., “Busy exam prep week; requesting help covering Friday club.”"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={!canSave || saving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Weekly Health'}
          </button>
        </div>

        {notice && <div className="p-3 rounded-lg bg-green-50 text-green-700 border border-green-200">{notice}</div>}
        {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 border border-red-200">{error}</div>}
      </div>

      <div className="text-sm text-neutral-500">
        Tip: After saving, open <code>/headteacher/health/teachers</code> and click Refresh to see it.
      </div>
    </div>
  )
}
