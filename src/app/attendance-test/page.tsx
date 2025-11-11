// app/attendance-test/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

type Tenant = { id: string; name: string; slug: string | null }
type Classroom = { id: string; name: string; grade: string | null; arm: string | null }
type Student = { id: string; firstName: string; lastName: string }
type Session = {
  id: string
  tenantId: string
  classroomId: string
  date: string
  takenByUserId: string | null
  createdAt: string
  updatedAt: string
}
type MarkStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
type ServerSummary = {
  tenantId: string
  classroomId: string
  date: string
  total: number
  present: number
  absent: number
  late: number
  excused: number
  pctPresent: number
}
type HistoryRow = {
  sessionId: string
  date: string
  total: number
  present: number
  absent: number
  late: number
  excused: number
  pctPresent: number
}

export default function AttendanceTestPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [classroomId, setClassroomId] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [date, setDate] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastStatus, setLastStatus] = useState<number | null>(null)
  const [marks, setMarks] = useState<Record<string, MarkStatus>>({})
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [serverSummary, setServerSummary] = useState<ServerSummary | null>(null)
  const [summaryMsg, setSummaryMsg] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [historyMsg, setHistoryMsg] = useState<string | null>(null)
  const [historyFrom, setHistoryFrom] = useState<string>('')
  const [historyTo, setHistoryTo] = useState<string>('')

  useEffect(() => {
    fetch('/api/test/tenants')
      .then(r => r.json())
      .then(d => setTenants(d.tenants || []))
      .catch(() => setTenants([]))
  }, [])

  useEffect(() => {
    if (!tenantId) {
      setClassrooms([])
      setClassroomId('')
      return
    }
    fetch(`/api/test/classrooms?tenantId=${encodeURIComponent(tenantId)}`)
      .then(r => r.json())
      .then(d => setClassrooms(d.classrooms || []))
      .catch(() => setClassrooms([]))
  }, [tenantId])

  useEffect(() => {
    setStudents([])
    if (!classroomId) return
    fetch(`/api/test/students?classroomId=${encodeURIComponent(classroomId)}`)
      .then(r => r.json())
      .then(d => setStudents(d.students || []))
      .catch(() => setStudents([]))
  }, [classroomId])

  function todayYYYYMMDD() {
    const now = new Date()
    return now.toISOString().slice(0, 10)
  }

  async function openSession() {
    setError(null)
    setResult(null)
    setSaveMsg(null)
    setServerSummary(null)
    setSummaryMsg(null)
    setLastStatus(null)
    if (!tenantId || !classroomId) {
      setError('Please select both Tenant and Classroom.')
      return
    }
    const payload: any = { tenantId, classroomId }
    const trimmed = date.trim()
    if (trimmed) payload.date = trimmed

    try {
      setLoading(true)
      const res = await fetch('/api/attendance/sessions/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setLastStatus(res.status)
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError((data && data.error) || `Failed (HTTP ${res.status})`)
      } else {
        setResult(data as Session)
        setMarks({})
      }
    } catch (e: any) {
      setError('Network or server error opening session.')
    } finally {
      setLoading(false)
    }
  }

  function setMark(studentId: string, status: MarkStatus) {
    setMarks(prev => ({ ...prev, [studentId]: status }))
  }

  function markAllPresent() {
    const next: Record<string, MarkStatus> = {}
    for (const s of students) next[s.id] = 'PRESENT'
    setMarks(next)
  }

  function clearAllMarks() {
    setMarks({})
  }

  async function saveMarks() {
    if (!result) {
      setSaveMsg('Open a session first.')
      return
    }
    const entries = Object.entries(marks).map(([studentId, status]) => ({
      studentId,
      status,
    }))
    if (!entries.length) {
      setSaveMsg('No marks to save yet.')
      return
    }
    setSaveMsg('Saving…')
    try {
      const res = await fetch('/api/attendance/marks/upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: result.id, marks: entries }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveMsg(`Save failed: ${data?.error || res.status}`)
      } else {
        setSaveMsg(`Saved ${data?.marks?.length ?? entries.length} marks.`)
      }
    } catch {
      setSaveMsg('Network error saving marks.')
    }
  }

  async function refreshServerSummary() {
    if (!tenantId || !classroomId) {
      setSummaryMsg('Pick tenant & classroom first.')
      return
    }
    setSummaryMsg('Loading summary…')
    const dateParam = (date.trim() || todayYYYYMMDD())
    try {
      const res = await fetch(`/api/attendance/sessions/summary?tenantId=${encodeURIComponent(tenantId)}&classroomId=${encodeURIComponent(classroomId)}&date=${encodeURIComponent(dateParam)}`)
      const data = await res.json()
      if (!res.ok) {
        setSummaryMsg(`Failed: ${data?.error || res.status}`)
        setServerSummary(null)
      } else {
        setServerSummary(data as ServerSummary)
        setSummaryMsg(null)
      }
    } catch {
      setSummaryMsg('Network error loading summary.')
      setServerSummary(null)
    }
  }

  async function loadHistory() {
    if (!tenantId || !classroomId) {
      setHistoryMsg('Pick tenant & classroom first.')
      return
    }
    setHistoryMsg('Loading history…')
    const params: string[] = [
      `tenantId=${encodeURIComponent(tenantId)}`,
      `classroomId=${encodeURIComponent(classroomId)}`
    ]
    if (historyFrom.trim()) params.push(`from=${encodeURIComponent(historyFrom.trim())}`)
    if (historyTo.trim()) params.push(`to=${encodeURIComponent(historyTo.trim())}`)
    try {
      const res = await fetch(`/api/attendance/sessions/list?${params.join('&')}`)
      const data = await res.json()
      if (!res.ok) {
        setHistoryMsg(`Failed: ${data?.error || res.status}`)
        setHistory(null)
      } else {
        setHistory(data.sessions as HistoryRow[])
        setHistoryMsg(null)
      }
    } catch {
      setHistoryMsg('Network error loading history.')
      setHistory(null)
    }
  }

  const presentPctClient = useMemo(() => {
    const total = students.length
    if (!total) return 0
    let present = 0
    for (const s of students) {
      if (marks[s.id] === 'PRESENT') present++
    }
    return Math.round((present / total) * 100)
  }, [students, marks])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Attendance Test Console</h1>
      <p className="text-sm opacity-70">Open/Reuse a session, then mark students and save. Refresh the server summary and view history by date.</p>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Column 1: Controls & Today */}
        <div className="space-y-4 lg:col-span-1">
          <div>
            <label className="block text-sm font-medium mb-1">Tenant</label>
            <select className="w-full border rounded p-2" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">-- Select Tenant --</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name} {t.slug ? `(${t.slug})` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Classroom</label>
            <select className="w-full border rounded p-2" value={classroomId} onChange={(e) => setClassroomId(e.target.value)} disabled={!tenantId}>
              <option value="">-- Select Classroom --</option>
              {classrooms.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.grade ? ` • ${c.grade}` : ''}{c.arm ? ` • ${c.arm}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Date (optional, YYYY-MM-DD)</label>
            <div className="flex gap-2">
              <input className="flex-1 border rounded p-2" placeholder={todayYYYYMMDD()} value={date} onChange={(e) => setDate(e.target.value)} />
              <button type="button" className="border rounded px-3" onClick={() => setDate(todayYYYYMMDD())}>Today</button>
              <button type="button" className="border rounded px-3" onClick={() => setDate('')}>Clear</button>
            </div>
          </div>

          <button className="bg-black text-white rounded px-4 py-2 disabled:opacity-60 w-full" onClick={openSession} disabled={loading || !tenantId || !classroomId}>
            {loading ? 'Opening…' : 'Open / Reuse Session'}
          </button>

          {lastStatus !== null && <div className="text-xs opacity-60">Open Session HTTP status: {lastStatus}</div>}

          {error && <div className="p-3 rounded border border-red-300 bg-red-50 text-sm">{error}</div>}

          {result && (
            <div className="p-3 rounded border bg-green-50 text-sm space-y-1">
              <div><b>Session ID:</b> {result.id}</div>
              <div><b>Date:</b> {result.date}</div>
              <div><b>Classroom ID:</b> {result.classroomId}</div>
              <div><b>Tenant ID:</b> {result.tenantId}</div>
              <div className="mt-2"><b>Today (client-side):</b> {presentPctClient}% present</div>
            </div>
          )}

          <div className="mt-4 border-t pt-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Server Summary</div>
              <button className="border rounded px-3 py-1" onClick={refreshServerSummary}>Refresh Server Summary</button>
            </div>
            {summaryMsg && <div className="text-sm opacity-80">{summaryMsg}</div>}
            {serverSummary && (
              <div className="mt-2 p-3 rounded border text-sm bg-blue-50 space-y-1">
                <div><b>Date:</b> {serverSummary.date}</div>
                <div><b>Enrolled:</b> {serverSummary.total}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><b>Present:</b> {serverSummary.present}</div>
                  <div><b>Absent:</b> {serverSummary.absent}</div>
                  <div><b>Late:</b> {serverSummary.late}</div>
                  <div><b>Excused:</b> {serverSummary.excused}</div>
                </div>
                <div className="mt-1"><b>Attendance %:</b> {serverSummary.pctPresent}%</div>
              </div>
            )}
          </div>
        </div>

        {/* Column 2–3: Students & History */}
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Students</div>
            <div className="flex gap-2">
              <button className="border rounded px-3 py-1 text-xs" onClick={markAllPresent} disabled={!students.length}>Mark All Present</button>
              <button className="border rounded px-3 py-1 text-xs" onClick={clearAllMarks} disabled={!students.length}>Clear All</button>
            </div>
          </div>
          <div className="text-xs opacity-60">Tap a status for each student, then click Save Marks.</div>

          <div className="grid gap-2">
            {students.map(s => {
              const current = marks[s.id] || ''
              return (
                <div key={s.id} className="flex items-center justify-between border rounded p-2">
                  <div className="font-medium">{s.lastName} {s.firstName}</div>
                  <div className="flex gap-2">
                    {(['PRESENT','ABSENT','LATE','EXCUSED'] as MarkStatus[]).map(st => (
                      <button
                        key={st}
                        className={`px-2 py-1 border rounded text-xs ${current === st ? 'bg-black text-white' : ''}`}
                        onClick={() => setMark(s.id, st)}
                        type="button"
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            {!students.length && <div className="text-sm opacity-60">No students found for this classroom.</div>}
          </div>
          <button className="bg-black text-white rounded px-4 py-2 disabled:opacity-60" onClick={saveMarks} disabled={!result || !students.length}>
            Save Marks
          </button>
          {saveMsg && <div className="text-sm opacity-80">{saveMsg}</div>}

          <div className="mt-6 border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">History (by date)</div>
              <div className="flex items-center gap-2">
                <input className="border rounded p-1 text-sm" placeholder="From YYYY-MM-DD" value={historyFrom} onChange={(e)=>setHistoryFrom(e.target.value)} />
                <input className="border rounded p-1 text-sm" placeholder="To YYYY-MM-DD" value={historyTo} onChange={(e)=>setHistoryTo(e.target.value)} />
                <button className="border rounded px-3 py-1" onClick={loadHistory}>Load</button>
              </div>
            </div>
            {historyMsg && <div className="text-sm opacity-80">{historyMsg}</div>}
            {history && history.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 border">Date</th>
                      <th className="text-left p-2 border">Present</th>
                      <th className="text-left p-2 border">Absent</th>
                      <th className="text-left p-2 border">Late</th>
                      <th className="text-left p-2 border">Excused</th>
                      <th className="text-left p-2 border">Enrolled</th>
                      <th className="text-left p-2 border">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.sessionId}>
                        <td className="p-2 border">{h.date}</td>
                        <td className="p-2 border">{h.present}</td>
                        <td className="p-2 border">{h.absent}</td>
                        <td className="p-2 border">{h.late}</td>
                        <td className="p-2 border">{h.excused}</td>
                        <td className="p-2 border">{h.total}</td>
                        <td className="p-2 border">{h.pctPresent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {history && history.length === 0 && <div className="text-sm opacity-60 mt-2">No sessions found in the selected range.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
