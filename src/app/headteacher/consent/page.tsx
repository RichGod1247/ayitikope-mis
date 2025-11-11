'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Tenant = { id: string; name: string; slug: string };

type StudentRow = {
  id: string;
  firstName: string;
  lastName: string;
  guardianName: string | null;
  guardianPhone: string | null;
  healthConsentAt: string | null;
  smsOptIn: boolean; // mapped from guardianSmsOptIn in API if present
};

type TeacherRow = {
  id: string;
  name: string | null;
  email: string | null;
  smsOptIn: boolean;
};

function cx(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}

function buildCsvUrls(tenantId?: string, classroomId?: string) {
  const q = new URLSearchParams();
  if (tenantId) q.set('tenantId', tenantId);
  if (classroomId) q.set('classroomId', classroomId);
  const qs = q.toString() ? `?${q.toString()}` : '';
  return {
    students: `/api/consent/students/export/csv${qs}`,
    teachers: `/api/consent/teachers/export/csv${qs}`,
  };
}

export default function ConsentPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'students' | 'teachers'>('students');

  // Students
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);
  const [studentError, setStudentError] = useState<string | null>(null);

  // Teachers
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [savingTeacherId, setSavingTeacherId] = useState<string | null>(null);
  const [teacherError, setTeacherError] = useState<string | null>(null);

  // Load tenants first
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/test/tenants', { cache: 'no-store' });
        const data = await res.json();
        const list = (data?.tenants ?? []) as Tenant[];
        setTenants(list);
        if (!tenantId && list.length > 0) {
          setTenantId(list[0].id);
        }
      } catch {
        // noop
      }
    })();
  }, []);

  // Load lists whenever tenant/tab changes
  useEffect(() => {
    if (!tenantId) return;
    if (activeTab === 'students') {
      loadStudents();
    } else {
      loadTeachers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activeTab]);

  async function loadStudents() {
    setLoadingStudents(true);
    setStudentError(null);
    try {
      const res = await fetch(`/api/consent/students/list?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load students');
      const data = await res.json();

      // Expecting shape: { items: [...] }
      const rows: StudentRow[] = (data?.items ?? []).map((s: any) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        guardianName: s.guardianName ?? null,
        guardianPhone: s.guardianPhone ?? null,
        healthConsentAt: s.healthConsentAt ?? null,
        // Handle either smsOptIn or guardianSmsOptIn from API, default false
        smsOptIn: (typeof s.smsOptIn === 'boolean' ? s.smsOptIn : (s.guardianSmsOptIn ?? false)) as boolean,
      }));
      setStudents(rows);
    } catch (e: any) {
      setStudentError(e?.message || 'Failed to load students');
    } finally {
      setLoadingStudents(false);
    }
  }

  async function loadTeachers() {
    setLoadingTeachers(true);
    setTeacherError(null);
    try {
      const res = await fetch(`/api/consent/teachers/list?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load teachers');
      const data = await res.json();

      const rows: TeacherRow[] = (data?.items ?? []).map((u: any) => ({
        id: u.id,
        name: u.name ?? null,
        email: u.email ?? null,
        smsOptIn: Boolean(u.smsOptIn),
      }));
      setTeachers(rows);
    } catch (e: any) {
      setTeacherError(e?.message || 'Failed to load teachers');
    } finally {
      setLoadingTeachers(false);
    }
  }

  // Save student row (consent + sms)
  async function saveStudent(row: StudentRow) {
    try {
      setSavingStudentId(row.id);
      setStudentError(null);
      const payload = {
        studentId: row.id,
        smsOptIn: row.smsOptIn,
        // If you want to keep the current value, pass it through; to "set now", you can pass ISO string on button click
        healthConsentAt: row.healthConsentAt,
      };
      const res = await fetch('/api/consent/students/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update student consent');
      await loadStudents();
    } catch (e: any) {
      setStudentError(e?.message || 'Failed to save student');
    } finally {
      setSavingStudentId(null);
    }
  }

  // “Set Consent Now” convenience
  async function setStudentConsentNow(id: string) {
    const target = students.find(s => s.id === id);
    if (!target) return;
    await saveStudent({ ...target, healthConsentAt: new Date().toISOString() });
  }

  // Save teacher row (sms)
  async function saveTeacher(row: TeacherRow) {
    try {
      setSavingTeacherId(row.id);
      setTeacherError(null);
      const payload = { userId: row.id, smsOptIn: row.smsOptIn };
      const res = await fetch('/api/consent/teachers/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update teacher consent');
      await loadTeachers();
    } catch (e: any) {
      setTeacherError(e?.message || 'Failed to save teacher');
    } finally {
      setSavingTeacherId(null);
    }
  }

  const currentTenant = useMemo(() => tenants.find(t => t.id === tenantId), [tenants, tenantId]);

  // Pre-build CSV URLs
  const { students: studentsCsvUrl, teachers: teachersCsvUrl } = buildCsvUrls(tenantId);

  return (
    <div className="p-6 space-y-6">
      {/* Header + toolbar */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Consent Center</h1>
            <p className="text-sm text-gray-500">Privacy-first controls for guardians and staff (opt-in, consent, audit & exports).</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Tenant select */}
            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              title="Tenant"
            >
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            {/* Quick links toolbar */}
            <Link
              href="/headteacher/consent/audit"
              className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
            >
              View Audit
            </Link>

            {/* Export buttons wired to API CSV endpoints */}
            <a
              href={tenantId ? studentsCsvUrl : undefined}
              download
              className={cx(
                'rounded-xl border px-3 py-2 text-sm hover:bg-gray-50',
                !tenantId && 'pointer-events-none opacity-50'
              )}
            >
              Export Students CSV
            </a>

            <a
              href={tenantId ? teachersCsvUrl : undefined}
              download
              className={cx(
                'rounded-xl border px-3 py-2 text-sm hover:bg-gray-50',
                !tenantId && 'pointer-events-none opacity-50'
              )}
            >
              Export Teachers CSV
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            className={cx(
              'px-3 py-2 text-sm',
              activeTab === 'students' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'
            )}
            onClick={() => setActiveTab('students')}
          >
            Students
          </button>
          <button
            className={cx(
              'px-3 py-2 text-sm',
              activeTab === 'teachers' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'
            )}
            onClick={() => setActiveTab('teachers')}
          >
            Teachers
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'students' ? (
        <div className="space-y-3">
          {studentError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{studentError}</div>
          )}
          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium">Guardian Consent & SMS</h2>
              <button
                onClick={loadStudents}
                className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
                disabled={loadingStudents}
              >
                {loadingStudents ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[800px] w-full text-sm">
                <thead className="text-left">
                  <tr className="border-b bg-gray-50">
                    <th className="p-2">Student</th>
                    <th className="p-2">Guardian</th>
                    <th className="p-2">Phone</th>
                    <th className="p-2">Consent Date</th>
                    <th className="p-2">SMS Opt-in</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id} className="border-b">
                      <td className="p-2 wrap-break-word">{s.lastName} {s.firstName}</td>
                      <td className="p-2">{s.guardianName || '—'}</td>
                      <td className="p-2">{s.guardianPhone || '—'}</td>
                      <td className="p-2">{s.healthConsentAt ? new Date(s.healthConsentAt).toLocaleDateString() : '—'}</td>
                      <td className="p-2">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={s.smsOptIn}
                            onChange={(e) => {
                              const next = students.map(r => r.id === s.id ? { ...r, smsOptIn: e.target.checked } : r);
                              setStudents(next);
                            }}
                          />
                          <span>{s.smsOptIn ? 'Yes' : 'No'}</span>
                        </label>
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setStudentConsentNow(s.id)}
                            className="rounded-lg border px-3 py-1.5 hover:bg-gray-50"
                            disabled={savingStudentId === s.id}
                          >
                            Set Consent Now
                          </button>
                          <button
                            onClick={() => saveStudent(s)}
                            className="rounded-lg bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                            disabled={savingStudentId === s.id}
                          >
                            {savingStudentId === s.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {(!loadingStudents && students.length === 0) && (
                    <tr>
                      <td className="p-4 text-center text-gray-500" colSpan={6}>No students found for this tenant.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {teacherError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{teacherError}</div>
          )}
          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium">Teacher SMS Opt-in</h2>
              <button
                onClick={loadTeachers}
                className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
                disabled={loadingTeachers}
              >
                {loadingTeachers ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm">
                <thead className="text-left">
                  <tr className="border-b bg-gray-50">
                    <th className="p-2">Name</th>
                    <th className="p-2">Email</th>
                    <th className="p-2">SMS Opt-in</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map(t => (
                    <tr key={t.id} className="border-b">
                      <td className="p-2 wrap-break-word">{t.name || '—'}</td>
                      <td className="p-2 wrap-break-word">{t.email || '—'}</td>
                      <td className="p-2">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={t.smsOptIn}
                            onChange={(e) => {
                              const next = teachers.map(r => r.id === t.id ? { ...r, smsOptIn: e.target.checked } : r);
                              setTeachers(next);
                            }}
                          />
                          <span>{t.smsOptIn ? 'Yes' : 'No'}</span>
                        </label>
                      </td>
                      <td className="p-2 text-right">
                        <button
                          onClick={() => saveTeacher(t)}
                          className="rounded-lg bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                          disabled={savingTeacherId === t.id}
                        >
                          {savingTeacherId === t.id ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  ))}

                  {(!loadingTeachers && teachers.length === 0) && (
                    <tr>
                      <td className="p-4 text-center text-gray-500" colSpan={4}>No teachers found for this tenant.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
