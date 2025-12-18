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
  smsOptIn: boolean; // from guardianSmsOptIn
};

type TeacherRow = {
  id: string;
  name: string | null;
  email: string | null;
  smsOptIn: boolean;
};

type Me = {
  ok: boolean;
  userId: string | null;
  email: string | null;
  name: string | null;
};

type BrandName = 'AyitikopJHS' | 'AyitikPRIM' | 'AyitiAdmin';

function cx(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}

/** Tiny toast */
type Toast = { id: number; text: string; tone?: 'default' | 'success' | 'error' };
function ToastHost({ items, remove }: { items: Toast[]; remove: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map(t => (
        <div
          key={t.id}
          className={cx(
            'rounded-xl px-4 py-3 shadow-md border text-sm bg-white',
            t.tone === 'success' && 'border-green-300 text-green-800',
            t.tone === 'error' && 'border-red-300 text-red-800',
            (!t.tone || t.tone === 'default') && 'border-gray-200 text-gray-800'
          )}
          onClick={() => remove(t.id)}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default function ConsentPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'students' | 'teachers'>('students');

  // brand selector
  const [brand, setBrand] = useState<BrandName>('AyitiAdmin');

  // current user (for actorId in CSV links)
  const [me, setMe] = useState<Me | null>(null);
  const actorId = me?.userId || null;

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

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (text: string, tone?: Toast['tone']) => {
    const id = Math.random();
    setToasts(prev => [...prev, { id, text, tone }]);
    setTimeout(() => removeToast(id), 3500);
  };
  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  // Load brand from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('consent.brand');
      if (saved === 'AyitikopJHS' || saved === 'AyitikPRIM' || saved === 'AyitiAdmin') {
        setBrand(saved);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('consent.brand', brand);
    } catch {}
  }, [brand]);

  // Load tenants + me
  useEffect(() => {
    (async () => {
      try {
        const [tenantsRes, meRes] = await Promise.all([
          fetch('/api/test/tenants', { cache: 'no-store' }),
          fetch('/api/me', { cache: 'no-store' }),
        ]);
        const tenantsData = await tenantsRes.json();
        const meData = (await meRes.json()) as Me;

        const list = (tenantsData?.tenants ?? []) as Tenant[];
        setTenants(list);
        if (!tenantId && list.length > 0) setTenantId(list[0].id);
        setMe(meData);
      } catch {
        pushToast('Failed to load tenants or session', 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load lists whenever tenant/tab changes
  useEffect(() => {
    if (!tenantId) return;
    if (activeTab === 'students') loadStudents();
    else loadTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activeTab]);

  async function loadStudents() {
    setLoadingStudents(true);
    setStudentError(null);
    try {
      const res = await fetch(`/api/consent/students/list?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load students');
      const data = await res.json();
      const rows: StudentRow[] = (data?.items ?? []).map((s: any) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        guardianName: s.guardianName ?? null,
        guardianPhone: s.guardianPhone ?? null,
        healthConsentAt: s.healthConsentAt ?? null,
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
        healthConsentAt: row.healthConsentAt,
      };
      const res = await fetch('/api/consent/students/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update student consent');
      pushToast('Student saved', 'success');
      await loadStudents();
    } catch (e: any) {
      setStudentError(e?.message || 'Failed to save student');
      pushToast('Save failed', 'error');
    } finally {
      setSavingStudentId(null);
    }
  }

  // “Set Consent Now”
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
      pushToast('Teacher saved', 'success');
      await loadTeachers();
    } catch (e: any) {
      setTeacherError(e?.message || 'Failed to save teacher');
      pushToast('Save failed', 'error');
    } finally {
      setSavingTeacherId(null);
    }
  }

  async function sendCampaign() {
    if (!tenantId) return;
    try {
      pushToast('Sending campaign…');
      const res = await fetch('/api/consent/campaign/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          brand,   // selected brand
          limit: 25,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushToast(`Campaign failed: ${data?.error || res.statusText}`, 'error');
        return;
      }
      const cnt = data?.count ?? 0;
      pushToast(`Campaign queued (${cnt} guardians)`, 'success');
    } catch {
      pushToast('Campaign error', 'error');
    }
  }

  const currentTenant = useMemo(() => tenants.find(t => t.id === tenantId), [tenants, tenantId]);

  const studentsCsvHref =
    tenantId
      ? `/api/consent/students/csv?tenantId=${encodeURIComponent(tenantId)}${actorId ? `&actorId=${encodeURIComponent(actorId)}` : ''}`
      : '#';

  const teachersCsvHref =
    tenantId
      ? `/api/consent/teachers/csv?tenantId=${encodeURIComponent(tenantId)}${actorId ? `&actorId=${encodeURIComponent(actorId)}` : ''}`
      : '#';

  return (
    <div className="p-6 space-y-6">
      {/* Header + toolbar */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Consent Center</h1>
            <p className="text-sm text-gray-500">
              Privacy-first controls for guardians and staff (opt-in, consent, audit, exports, campaigns).
            </p>
            {currentTenant && (
              <p className="text-xs text-gray-400 mt-1">
                Tenant: <span className="font-medium">{currentTenant.name}</span>
              </p>
            )}
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

            {/* Brand select */}
            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={brand}
              onChange={(e) => setBrand(e.target.value as BrandName)}
              title="SMS Brand / Sender ID"
            >
              <option value="AyitikopJHS">AyitikopJHS</option>
              <option value="AyitikPRIM">AyitikPRIM</option>
              <option value="AyitiAdmin">AyitiAdmin</option>
            </select>

            {/* Quick links toolbar */}
            <Link
              href="/headteacher/consent/audit"
              className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
            >
              View Audit
            </Link>

            <a
              href={studentsCsvHref}
              className={cx(
                'rounded-xl border px-3 py-2 text-sm hover:bg-gray-50',
                (!tenantId || !me) && 'pointer-events-none opacity-50'
              )}
              target="_blank"
              rel="noreferrer"
              title={me ? 'Download Students CSV' : 'Loading user…'}
            >
              Export Students CSV
            </a>

            <a
              href={teachersCsvHref}
              className={cx(
                'rounded-xl border px-3 py-2 text-sm hover:bg-gray-50',
                (!tenantId || !me) && 'pointer-events-none opacity-50'
              )}
              target="_blank"
              rel="noreferrer"
              title={me ? 'Download Teachers CSV' : 'Loading user…'}
            >
              Export Teachers CSV
            </a>

            <button
              onClick={sendCampaign}
              className="rounded-xl bg-blue-600 text-white px-3 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
              disabled={!tenantId}
              title="Send consent campaign SMS to a small batch"
            >
              Send Campaign
            </button>
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
              <h2 className="text-lg font-medium">Guardian Consent &amp; SMS</h2>
              <button
                onClick={loadStudents}
                className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
                disabled={loadingStudents}
              >
                {loadingStudents ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
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
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Link
                            href={`/headteacher/consent/letters/student/${encodeURIComponent(s.id)}`}
                            className="rounded-lg border px-3 py-1.5 hover:bg-gray-50"
                            target="_blank"
                          >
                            View Letter
                          </Link>
                          <a
                            href={`/api/consent/letters/student/${encodeURIComponent(s.id)}/pdf`}
                            className="rounded-lg border px-3 py-1.5 hover:bg-gray-50"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Print PDF
                          </a>
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
              <table className="min-w-[900px] w-full text-sm">
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
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Link
                            href={`/headteacher/consent/letters/teacher/${encodeURIComponent(t.id)}`}
                            className="rounded-lg border px-3 py-1.5 hover:bg-gray-50"
                            target="_blank"
                          >
                            View Letter
                          </Link>
                          <button
                            onClick={() => saveTeacher(t)}
                            className="rounded-lg bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                            disabled={savingTeacherId === t.id}
                          >
                            {savingTeacherId === t.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
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

      <ToastHost items={toasts} remove={removeToast} />
    </div>
  );
}
