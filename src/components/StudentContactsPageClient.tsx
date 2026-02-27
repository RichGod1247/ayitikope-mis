// src/components/StudentContactsPageClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Tenant = {
  id: string;
  name: string;
  slug?: string;
  schoolCode?: string;
};

type ClassroomOption = {
  id: string;
  label: string;
};

type StudentContact = {
  id: string;
  firstName: string;
  lastName: string;
  classLabel?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianAltPhone?: string | null;
  relationship?: string | null;
  notes?: string | null;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

async function fetchActiveTenant(): Promise<Tenant | null> {
  const r = await fetch("/api/me", { cache: "no-store" });
  const j: any = await r.json().catch(() => ({}));

  if (!r.ok || !j?.ok) return null;

  const tid =
    j?.tenantId ||
    j?.tenant?.id ||
    (Array.isArray(j?.tenants) ? j.tenants[0]?.id : null);

  if (!tid) return null;

  const tname =
    j?.tenant?.name ||
    (Array.isArray(j?.tenants) ? j.tenants[0]?.name : null) ||
    "School";

  const slug =
    j?.tenant?.slug ??
    (Array.isArray(j?.tenants) ? j.tenants[0]?.slug : null) ??
    undefined;

  const schoolCode =
    j?.tenant?.schoolCode ??
    (Array.isArray(j?.tenants) ? j.tenants[0]?.schoolCode : null) ??
    undefined;

  return { id: String(tid), name: String(tname), slug, schoolCode };
}

export default function StudentContactsPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [mode, setMode] = useState<"single" | "multi">("single");

  const [classOptions, setClassOptions] = useState<ClassroomOption[]>([]);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);
  const [classroomId, setClassroomId] = useState("");

  const [contacts, setContacts] = useState<StudentContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);

  const [info, setInfo] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [onlyWithPhone, setOnlyWithPhone] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  // Bootstrap tenant
  useEffect(() => {
    (async () => {
      setTenantLoading(true);
      setTenantError(null);
      try {
        const t = await fetchActiveTenant();
        if (t?.id) setTenant(t);
        else setTenantError("No school context found for this account.");
      } catch {
        setTenantError("Failed to load tenant information.");
      } finally {
        setTenantLoading(false);
      }
    })();
  }, []);

  async function fetchClassOptions(m: "single" | "multi") {
    setClassLoading(true);
    setClassError(null);
    try {
      // ✅ Tenant is derived server-side from session (NO tenantId param)
      const url = `/api/classrooms/list?mode=${encodeURIComponent(m)}`;
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));

      let items: ClassroomOption[] = [];
      if (r.ok && Array.isArray(j?.items)) {
        items = j.items.map((x: any) => ({
          id: String(x.id),
          label: String(x.label ?? ""),
        }));
      }

      setClassOptions(items);

      if (!items.length) {
        setClassroomId("");
        setClassError("No classrooms found. Use the seed buttons below to create standard KG–JHS classes.");
      } else {
        const existing = items.find((c) => c.id === classroomId);
        setClassroomId(existing ? existing.id : items[0].id);
      }
    } catch {
      setClassOptions([]);
      setClassroomId("");
      setClassError("Failed to load classrooms.");
    } finally {
      setClassLoading(false);
    }
  }

  useEffect(() => {
    if (tenant?.id) fetchClassOptions(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, mode]);

  async function seedClasses(modeToSeed: "single" | "multi") {
    if (!tenant?.id) return;
    setClassLoading(true);
    setClassError(null);
    try {
      // ✅ Tenant derived server-side; keep tenantId OUT
      const r = await fetch("/api/classrooms/seed-canonical", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: modeToSeed }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setClassError(j?.error || "Failed to seed classrooms.");
      else await fetchClassOptions(mode);
    } catch {
      setClassError("Error while seeding classrooms.");
    } finally {
      setClassLoading(false);
    }
  }

  async function loadContacts() {
    if (!tenant?.id || !classroomId) return;
    setContactsLoading(true);
    setContactsError(null);
    setInfo(null);
    setCopyMessage(null);

    try {
      const params = new URLSearchParams();
      // ✅ Tenant derived server-side; only classroomId is needed
      params.set("classroomId", classroomId);

      const r = await fetch(`/api/students/contacts/list?${params.toString()}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setContacts([]);
        setContactsError(j?.error || "Failed to load contacts.");
        return;
      }

      const items = Array.isArray(j.items) ? (j.items as StudentContact[]) : [];
      setContacts(items);

      if (!items.length) {
        setInfo("No contacts found for this class yet. This usually means students have not been enrolled with guardian details.");
      }
    } catch {
      setContacts([]);
      setContactsError("Network or server error while loading contacts.");
    } finally {
      setContactsLoading(false);
    }
  }

  const filteredContacts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return contacts.filter((c) => {
      if (onlyWithPhone) {
        const hasPhone =
          (c.guardianPhone && c.guardianPhone.trim().length > 0) ||
          (c.guardianAltPhone && c.guardianAltPhone.trim().length > 0);
        if (!hasPhone) return false;
      }

      if (!term) return true;

      const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
      const guardianName = c.guardianName ?? "";
      const classLabel = c.classLabel ?? "";
      const phone1 = c.guardianPhone ?? "";
      const phone2 = c.guardianAltPhone ?? "";

      const haystack = `${fullName} ${guardianName} ${classLabel} ${phone1} ${phone2}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [contacts, searchTerm, onlyWithPhone]);

  const summary = useMemo(() => {
    const total = contacts.length;
    const withPrimaryPhone = contacts.filter((c) => c.guardianPhone && c.guardianPhone.trim().length > 0).length;
    const withAnyPhone = contacts.filter((c) => {
      const p1 = c.guardianPhone?.trim();
      const p2 = c.guardianAltPhone?.trim();
      return (p1 && p1.length > 0) || (p2 && p2.length > 0);
    }).length;

    return { total, withPrimaryPhone, withAnyPhone };
  }, [contacts]);

  const visibleCount = filteredContacts.length;

  async function copyVisiblePhones() {
    setCopyMessage(null);

    const phonesRaw: string[] = [];
    for (const c of filteredContacts) {
      if (c.guardianPhone && c.guardianPhone.trim().length > 0) phonesRaw.push(c.guardianPhone.trim());
      if (c.guardianAltPhone && c.guardianAltPhone.trim().length > 0) phonesRaw.push(c.guardianAltPhone.trim());
    }

    const uniquePhones = Array.from(new Set(phonesRaw));
    if (!uniquePhones.length) {
      setCopyMessage("No phone numbers in the current view to copy.");
      return;
    }

    const textToCopy = uniquePhones.join(", ");

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        setCopyMessage(`Copied ${uniquePhones.length} phone number${uniquePhones.length === 1 ? "" : "s"} to clipboard.`);
      } else {
        setCopyMessage("One-click copy is not supported here. You can still copy numbers from the table.");
      }
    } catch {
      setCopyMessage("Unable to copy. Please select and copy numbers from the table manually.");
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Student & Guardian Contacts</h1>
        <p className="text-sm text-zinc-600 max-w-3xl break-words">
          A calm directory of <span className="font-semibold">students and guardians</span> for care and support.
        </p>
      </header>

      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">School Context</div>
            <div className="text-sm">
              Tenant / School:{" "}
              <span className="font-semibold">{tenantLoading ? "Loading..." : tenant?.name || "Unknown School"}</span>
              {tenant?.schoolCode ? <span className="text-xs text-zinc-500"> — {tenant.schoolCode}</span> : null}
            </div>
            {tenantError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {tenantError}
              </div>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Class Mode</div>
            <div className="flex items-center gap-2">
              <button
                className={`${btnOutline} h-8 px-3 ${mode === "single" ? "ring-2 ring-zinc-800" : ""}`}
                onClick={() => setMode("single")}
                disabled={classLoading}
              >
                Single-stream
              </button>
              <button
                className={`${btnOutline} h-8 px-3 ${mode === "multi" ? "ring-2 ring-zinc-800" : ""}`}
                onClick={() => setMode("multi")}
                disabled={classLoading}
              >
                Multi-stream (A–D)
              </button>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3 pt-2">
          <div>
            <label className="block text-sm font-medium mb-1">Classroom</label>
            {classLoading ? (
              <div className="h-10 rounded-xl border bg-zinc-50 animate-pulse" />
            ) : classOptions.length ? (
              <select
                className="w-full border rounded-xl px-2 py-2 h-10 text-sm"
                value={classroomId}
                onChange={(e) => setClassroomId(e.target.value)}
              >
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="border rounded-xl p-3 text-sm text-zinc-700">
                {classError || "No classrooms available yet."}
              </div>
            )}
          </div>

          <div className="flex items-end gap-2">
            <button
              className={btnPrimary + " w-full"}
              onClick={loadContacts}
              disabled={contactsLoading || !tenant?.id || !classroomId || classLoading}
            >
              {contactsLoading ? "Loading contacts…" : "Load contacts"}
            </button>
            <button
              className={btnOutline + " w-full"}
              onClick={() => fetchClassOptions(mode)}
              disabled={!tenant?.id || classLoading}
            >
              Reload classes
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Quick seeding</div>
            <div className="flex flex-wrap gap-2">
              <button className={btnOutline} onClick={() => seedClasses("single")} disabled={!tenant?.id || classLoading}>
                Seed KG1 → JHS3 (single)
              </button>
              <button className={btnOutline} onClick={() => seedClasses("multi")} disabled={!tenant?.id || classLoading}>
                Seed KG1 → JHS3 (A–D)
              </button>
            </div>
          </div>
        </div>

        {classError && (
          <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {classError}
          </div>
        )}
      </section>

      <section className="border rounded-xl p-4 bg-white space-y-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Contacts Summary</div>
            <div>
              Total students loaded: <span className="font-semibold">{summary.total}</span>
            </div>
            <div>
              With primary guardian phone: <span className="font-semibold">{summary.withPrimaryPhone}</span>
            </div>
            <div>
              With any phone: <span className="font-semibold">{summary.withAnyPhone}</span>
            </div>
            <div className="text-xs text-zinc-500">
              Visible after filters: <span className="font-semibold">{visibleCount}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border rounded-xl p-4 bg-white">
        <div className="flex flex-col gap-3 mb-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">
              Contacts for {classOptions.find((c) => c.id === classroomId)?.label || "selected class"}
            </h2>
            {contactsLoading && <span className="block text-xs text-zinc-500">Loading contacts…</span>}
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              type="text"
              placeholder="Search by student, guardian, class, or phone…"
              className="w-full md:w-64 border rounded-xl px-3 py-1.5 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
              <input type="checkbox" checked={onlyWithPhone} onChange={(e) => setOnlyWithPhone(e.target.checked)} />
              Only with phone
            </label>
            <button className={btnOutline} onClick={copyVisiblePhones} disabled={!filteredContacts.length}>
              Copy phone list (view)
            </button>
          </div>
        </div>

        {contactsError && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {contactsError}
          </div>
        )}

        {info && !contactsError && (
          <div className="mb-3 text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
            {info}
          </div>
        )}

        {copyMessage && (
          <div className="mb-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            {copyMessage}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border rounded-xl overflow-hidden">
            <thead className="bg-zinc-50 text-xs text-zinc-600">
              <tr>
                <th className="px-3 py-2 text-left border-b">Student</th>
                <th className="px-3 py-2 text-left border-b">Class</th>
                <th className="px-3 py-2 text-left border-b">Guardian</th>
                <th className="px-3 py-2 text-left border-b">Primary Phone</th>
                <th className="px-3 py-2 text-left border-b">Alt. Phone</th>
                <th className="px-3 py-2 text-left border-b">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((c) => {
                const hasPrimary = c.guardianPhone && c.guardianPhone.trim().length > 0;
                const rowNeedsAttention = !hasPrimary;

                return (
                  <tr key={c.id} className={`border-b last:border-b-0 ${rowNeedsAttention ? "bg-amber-50/40" : ""}`}>
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed"}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">{c.classLabel || "—"}</td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">{c.guardianName || "—"}</td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {c.guardianPhone ? (
                        c.guardianPhone
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          <span>No phone on file</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">{c.guardianAltPhone || "—"}</td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700 max-w-xs break-words">
                      {c.notes || (rowNeedsAttention ? "No guardian phone yet" : "—")}
                    </td>
                  </tr>
                );
              })}

              {!filteredContacts.length && !contactsLoading && !contactsError && (
                <tr>
                  <td className="px-3 py-4 text-sm text-zinc-600" colSpan={6}>
                    No contacts match the current filters/search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
