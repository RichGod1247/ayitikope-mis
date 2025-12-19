// src/app/students/contacts/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Tenant = {
  id: string;
  name: string;
  slug?: string;
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

  // NEW: search + filter + copy feedback
  const [searchTerm, setSearchTerm] = useState("");
  const [onlyWithPhone, setOnlyWithPhone] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  // -------------------------
  // Bootstrap tenant
  // -------------------------
  useEffect(() => {
    (async () => {
      setTenantLoading(true);
      setTenantError(null);
      try {
        const r = await fetch("/api/test/tenants");
        const j = await r.json().catch(() => ({}));
        const t = j?.tenants?.[0];
        if (t?.id) {
          setTenant({ id: t.id, name: t.name || "School", slug: t.slug });
        } else {
          setTenantError(
            "No tenants found. Please seed or configure a default tenant."
          );
        }
      } catch {
        setTenantError("Failed to load tenant information.");
      } finally {
        setTenantLoading(false);
      }
    })();
  }, []);

  // -------------------------
  // Classrooms
  // -------------------------
  async function fetchClassOptions(tid: string, m: "single" | "multi") {
    setClassLoading(true);
    setClassError(null);
    try {
      const url = `/api/classrooms/list?tenantId=${encodeURIComponent(
        tid
      )}&mode=${m}`;
      const r = await fetch(url);
      const j = await r.json().catch(() => ({}));

      let items: ClassroomOption[] = [];
      if (r.ok && Array.isArray(j?.items)) {
        items = j.items.map((x: any) => ({
          id: x.id as string,
          label: (x.label as string) || "",
        }));
      }

      setClassOptions(items);
      if (!items.length) {
        setClassroomId("");
        setClassError(
          "No classrooms found. Use the seed buttons below to create standard KG–JHS classes."
        );
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
    if (tenant?.id) {
      fetchClassOptions(tenant.id, mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, mode]);

  async function seedClasses(modeToSeed: "single" | "multi") {
    if (!tenant?.id) return;
    setClassLoading(true);
    setClassError(null);
    try {
      const r = await fetch("/api/classrooms/seed-canonical", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id, mode: modeToSeed }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setClassError(j?.error || "Failed to seed classrooms.");
      } else {
        await fetchClassOptions(tenant.id, mode);
      }
    } catch {
      setClassError("Error while seeding classrooms.");
    } finally {
      setClassLoading(false);
    }
  }

  // -------------------------
  // Load contacts for class
  // -------------------------
  async function loadContacts() {
    if (!tenant?.id || !classroomId) return;
    setContactsLoading(true);
    setContactsError(null);
    setInfo(null);
    setCopyMessage(null);

    try {
      const params = new URLSearchParams();
      params.set("tenantId", tenant.id);
      params.set("classroomId", classroomId);

      const r = await fetch(`/api/students/contacts/list?${params.toString()}`);
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setContacts([]);
        setContactsError(
          j?.error ||
            "Failed to load contacts. Please try again or contact the system administrator."
        );
        return;
      }

      const items = Array.isArray(j.items) ? (j.items as StudentContact[]) : [];
      setContacts(items);

      if (!items.length) {
        setInfo(
          "No contacts found for this class yet. This usually means students have not been enrolled with guardian details."
        );
      }
    } catch {
      setContacts([]);
      setContactsError("Network or server error while loading contacts.");
    } finally {
      setContactsLoading(false);
    }
  }

  // -------------------------
  // Derived: filtered contacts
  // -------------------------
  const filteredContacts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return contacts.filter((c) => {
      // phone filter
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

      const haystack =
        `${fullName} ${guardianName} ${classLabel} ${phone1} ${phone2}`.toLowerCase();

      return haystack.includes(term);
    });
  }, [contacts, searchTerm, onlyWithPhone]);

  // -------------------------
  // Summary
  // -------------------------
  const summary = useMemo(() => {
    const total = contacts.length;
    const withPrimaryPhone = contacts.filter(
      (c) => c.guardianPhone && c.guardianPhone.trim().length > 0
    ).length;
    const withAnyPhone = contacts.filter((c) => {
      const p1 = c.guardianPhone?.trim();
      const p2 = c.guardianAltPhone?.trim();
      return (p1 && p1.length > 0) || (p2 && p2.length > 0);
    }).length;

    return { total, withPrimaryPhone, withAnyPhone };
  }, [contacts]);

  const visibleCount = filteredContacts.length;

  // -------------------------
  // Copy phone numbers (current view)
  // -------------------------
  async function copyVisiblePhones() {
    setCopyMessage(null);

    // Collect all phones in current view
    const phonesRaw: string[] = [];
    for (const c of filteredContacts) {
      if (c.guardianPhone && c.guardianPhone.trim().length > 0) {
        phonesRaw.push(c.guardianPhone.trim());
      }
      if (c.guardianAltPhone && c.guardianAltPhone.trim().length > 0) {
        phonesRaw.push(c.guardianAltPhone.trim());
      }
    }

    const uniquePhones = Array.from(new Set(phonesRaw));

    if (!uniquePhones.length) {
      setCopyMessage(
        "No phone numbers in the current view to copy. You may need to remove filters or update guardian contacts."
      );
      return;
    }

    const textToCopy = uniquePhones.join(", ");

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        setCopyMessage(
          `Copied ${uniquePhones.length} phone number${
            uniquePhones.length === 1 ? "" : "s"
          } to clipboard for quick outreach.`
        );
      } else {
        // Fallback: still show the text in an info block
        setCopyMessage(
          "Your browser does not support one-click copy. You can still select and copy phone numbers directly from the table below."
        );
      }
    } catch {
      setCopyMessage(
        "Unable to copy to clipboard. Please select and copy the numbers from the table manually."
      );
    }
  }

  // -------------------------
  // UI
  // -------------------------
  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Student & Guardian Contacts</h1>
        <p className="text-sm text-zinc-600 max-w-3xl wrap-break-word">
          A calm, privacy-respectful directory of{" "}
          <span className="font-semibold">
            students and their primary guardians
          </span>{" "}
          to help teachers, SHEP coordinators, and heads follow up with families
          when needed. Not for marketing or pressure —{" "}
          <span className="font-semibold">only for care and support.</span>
        </p>
      </header>

      {/* Tenant + mode + class selection */}
      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              School Context
            </div>
            <div className="text-sm">
              Tenant / School:{" "}
              <span className="font-semibold">
                {tenantLoading
                  ? "Loading..."
                  : tenant?.name || "Unknown School"}
              </span>
            </div>
            {tenantError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {tenantError}
              </div>
            )}
            <p className="text-xs text-zinc-500 max-w-md wrap-break-word">
              Contact details here should be{" "}
              <span className="font-semibold">
                accurate and up to date, but never abused
              </span>
              . One call from a caring teacher is better than ten automated
              messages.
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Class Mode
            </div>
            <div className="flex items-center gap-2">
              <button
                className={`${btnOutline} h-8 px-3 ${
                  mode === "single" ? "ring-2 ring-zinc-800" : ""
                }`}
                onClick={() => setMode("single")}
                disabled={classLoading}
              >
                Single-stream
              </button>
              <button
                className={`${btnOutline} h-8 px-3 ${
                  mode === "multi" ? "ring-2 ring-zinc-800" : ""
                }`}
                onClick={() => setMode("multi")}
                disabled={classLoading}
              >
                Multi-stream (A–D)
              </button>
            </div>
            <p className="text-xs text-zinc-500 max-w-xs wrap-break-word">
              Choose how classes are structured in this school. You can seed
              either pattern below if this is a new setup.
            </p>
          </div>
        </div>

        {/* Class selection + actions */}
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
              disabled={
                contactsLoading || !tenant?.id || !classroomId || classLoading
              }
            >
              {contactsLoading ? "Loading contacts…" : "Load contacts"}
            </button>
            <button
              className={btnOutline + " w-full"}
              onClick={() => {
                if (!tenant?.id) return;
                fetchClassOptions(tenant.id, mode);
              }}
              disabled={!tenant?.id || classLoading}
            >
              Reload classes
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Quick seeding
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={btnOutline}
                onClick={() => seedClasses("single")}
                disabled={!tenant?.id || classLoading}
              >
                Seed KG1 → JHS3 (single)
              </button>
              <button
                className={btnOutline}
                onClick={() => seedClasses("multi")}
                disabled={!tenant?.id || classLoading}
              >
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

      {/* Summary */}
      <section className="border rounded-xl p-4 bg-white space-y-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Contacts Summary
            </div>
            <div>
              Total students loaded for this class:{" "}
              <span className="font-semibold">{summary.total}</span>
            </div>
            <div>
              With primary guardian phone:{" "}
              <span className="font-semibold">{summary.withPrimaryPhone}</span>
            </div>
            <div>
              With at least one phone (primary or alternate):{" "}
              <span className="font-semibold">{summary.withAnyPhone}</span>
            </div>
            <div className="text-xs text-zinc-500">
              Currently visible after filters/search:{" "}
              <span className="font-semibold">{visibleCount}</span>
            </div>
          </div>
          <p className="text-xs text-zinc-500 max-w-md wrap-break-word">
            <span className="font-semibold">Ethics guardrail:</span> These
            numbers are to help plan{" "}
            <span className="font-semibold">support and outreach</span>, not to
            label or shame families with missing numbers. Missing contacts can
            be gently completed during PTA and school visits.
          </p>
        </div>
      </section>

      {/* Contacts table + search/filter/copy */}
      <section className="border rounded-xl p-4 bg-white">
        <div className="flex flex-col gap-3 mb-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">
              Contacts for{" "}
              {classOptions.find((c) => c.id === classroomId)?.label ||
                "selected class"}
            </h2>
            {contactsLoading && (
              <span className="block text-xs text-zinc-500">
                Loading contacts…
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search by student, guardian, class, or phone…"
                className="w-full md:w-64 border rounded-xl px-3 py-1.5 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
              <input
                type="checkbox"
                checked={onlyWithPhone}
                onChange={(e) => setOnlyWithPhone(e.target.checked)}
              />
              Show only learners with at least one phone number
            </label>
            <button
              className={btnOutline}
              onClick={copyVisiblePhones}
              disabled={!filteredContacts.length}
            >
              Copy phone list (current view)
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
                const hasPrimary =
                  c.guardianPhone && c.guardianPhone.trim().length > 0;
                const rowNeedsAttention = !hasPrimary;

                return (
                  <tr
                    key={c.id}
                    className={`border-b last:border-b-0 ${
                      rowNeedsAttention ? "bg-amber-50/40" : ""
                    }`}
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold">
                        {[c.firstName, c.lastName].filter(Boolean).join(" ") ||
                          "Unnamed"}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {c.classLabel || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {c.guardianName || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {c.guardianPhone ? (
                        c.guardianPhone
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                          <span>No phone on file</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700">
                      {c.guardianAltPhone || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-700 max-w-xs wrap-break-word">
                      {c.notes || (rowNeedsAttention ? "No guardian phone yet" : "—")}
                    </td>
                  </tr>
                );
              })}
              {!filteredContacts.length &&
                !contactsLoading &&
                !contactsError && (
                  <tr>
                    <td
                      className="px-3 py-4 text-sm text-zinc-600"
                      colSpan={7}
                    >
                      No contacts match the current filters. You can clear the
                      search box or uncheck{" "}
                      <span className="font-semibold">
                        “Show only learners with at least one phone number”
                      </span>{" "}
                      to see more.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-zinc-500 max-w-3xl wrap-break-word">
          This page is intentionally{" "}
          <span className="font-semibold">view-only</span>. Any future bulk
          messaging tools should live under{" "}
          <span className="font-semibold">Admin → Tools</span>, with clear
          guardrails around costs, consent, and message tone — staying true to
          your identity as a{" "}
          <span className="font-semibold">repairer of the breach</span>, not a
          source of pressure.
        </p>
      </section>
    </main>
  );
}
