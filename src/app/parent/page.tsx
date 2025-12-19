// src/app/parent/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const DEFAULT_TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";
const DEFAULT_TERM = "1st Term";
const DEFAULT_ACADEMIC_YEAR = "2025/2026";
const DEFAULT_GUARDIAN_PHONE = "0240000000";

// Basic shape for a child from /api/parent/children
type Child = {
  id: string;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  classroomName?: string | null;
  classroomId?: string | null;
};

type ChildrenState = "idle" | "loading" | "loaded" | "error";

const ParentHomePage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Prefill from URL if present (e.g. after OTP login)
  const initialTenantId =
    searchParams.get("tenantId") ?? DEFAULT_TENANT_ID;
  const initialGuardianPhone =
    searchParams.get("guardianPhone") ?? DEFAULT_GUARDIAN_PHONE;

  // Core form state
  const [tenantId, setTenantId] = useState<string>(initialTenantId);
  const [guardianPhone, setGuardianPhone] =
    useState<string>(initialGuardianPhone);
  const [studentId, setStudentId] = useState<string>(""); // manual fallback
  const [term, setTerm] = useState<string>(DEFAULT_TERM);
  const [academicYear, setAcademicYear] = useState<string>(
    DEFAULT_ACADEMIC_YEAR
  );

  const [error, setError] = useState<string | null>(null);

  // Children state
  const [children, setChildren] = useState<Child[]>([]);
  const [childrenState, setChildrenState] =
    useState<ChildrenState>("idle");
  const [childrenError, setChildrenError] = useState<string | null>(
    null
  );
  const [selectedChildId, setSelectedChildId] = useState<string | null>(
    null
  );

  // Helper: compute display name for a child
  function getChildName(child: Child): string {
    if (child.fullName && child.fullName.trim().length > 0) {
      return child.fullName;
    }
    const parts = [
      child.firstName?.trim() ?? "",
      child.lastName?.trim() ?? "",
    ].filter(Boolean);
    return parts.join(" ") || child.id;
  }

  // Helper: load children whenever tenantId + guardianPhone are set
  useEffect(() => {
    async function loadChildren() {
      setChildren([]);
      setSelectedChildId(null);
      setChildrenError(null);

      const t = tenantId.trim();
      const p = guardianPhone.trim();
      if (!t || !p) {
        setChildrenState("idle");
        return;
      }

      try {
        setChildrenState("loading");
        const params = new URLSearchParams({
          tenantId: t,
          guardianPhone: p,
        });

        const res = await fetch(
          `/api/parent/children?${params.toString()}`
        );

        const text = await res.text();
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          console.error(
            "[ParentHomePage] Failed to parse children JSON:",
            text
          );
          setChildrenState("error");
          setChildrenError(
            "Server returned an invalid response while loading your children."
          );
          return;
        }

        if (!res.ok || !json.ok) {
          const msg =
            (json && json.error) ||
            `Failed to load children (HTTP ${res.status}).`;
          console.error("[ParentHomePage] Children error:", msg);
          setChildrenState("error");
          setChildrenError(String(msg));
          return;
        }

        const kids: Child[] = Array.isArray(json.children)
          ? json.children
          : [];
        setChildren(kids);
        setChildrenState("loaded");

        // Auto-select first child if available
        if (kids.length > 0) {
          setSelectedChildId(kids[0].id);
        }
      } catch (err) {
        console.error(
          "[ParentHomePage] Children fetch exception:",
          err
        );
        setChildrenState("error");
        setChildrenError(
          "Something went wrong while loading your children. Please try again."
        );
      }
    }

    loadChildren();
  }, [tenantId, guardianPhone]);

  function handleOpenTermReport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const t = tenantId.trim();
    const p = guardianPhone.trim();
    const chosenChildId = selectedChildId?.trim() ?? "";
    const manualId = studentId.trim();

    if (!t || !p) {
      setError(
        "Please fill tenant ID and phone number. These identify your school and you as a parent."
      );
      return;
    }

    const effectiveStudentId = chosenChildId || manualId;
    if (!effectiveStudentId) {
      setError(
        "Please select a child from the list or enter a student ID."
      );
      return;
    }

    const params = new URLSearchParams({
      tenantId: t,
      studentId: effectiveStudentId,
      term: term.trim(),
      academicYear: academicYear.trim(),
    });

    router.push(`/parent/report?${params.toString()}`);
  }

  function handleOpenSmsAlerts(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const t = tenantId.trim();
    const p = guardianPhone.trim();

    if (!t || !p) {
      setError(
        "Please fill tenant ID and phone number before opening SMS alerts."
      );
      return;
    }

    const params = new URLSearchParams({
      tenantId: t,
      guardianPhone: p,
    });

    router.push(`/parent/sms-alerts?${params.toString()}`);
  }

  const hasChildren = children.length > 0;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 space-y-2">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Parent Portal (Demo)
          </h1>
          <p className="text-sm text-slate-600">
            This is a simple starting point for parents. After OTP
            login, your school ID and phone number can be filled
            automatically, and any children linked to your phone will
            appear here.
          </p>
        </header>

        {/* Global error banner */}
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* Main card */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-xs sm:text-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Your details (demo)
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            For now, we are using demo values. When the full OTP flow
            is live, these fields will be filled in automatically after
            login and your children will appear below.
          </p>

          <form className="mt-4 space-y-3">
            {/* Tenant ID */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Tenant ID
              </label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="School tenant ID"
              />
              <p className="text-[11px] text-slate-500">
                Demo:{" "}
                <span className="font-mono">{DEFAULT_TENANT_ID}</span>
              </p>
            </div>

            {/* Guardian phone */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Your phone number
              </label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                placeholder="e.g. 0240000000"
              />
              <p className="text-[11px] text-slate-500">
                Use the same phone number that the school used to send
                you SMS alerts.
              </p>
            </div>

            {/* Children list */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Your children (linked to this phone)
              </label>

              {childrenState === "idle" && (
                <p className="text-[11px] text-slate-500">
                  Enter your tenant ID and phone number above to load
                  your children.
                </p>
              )}

              {childrenState === "loading" && (
                <p className="text-[11px] text-slate-500">
                  Loading children…
                </p>
              )}

              {childrenState === "error" && childrenError && (
                <p className="text-[11px] text-rose-700">
                  {childrenError}
                </p>
              )}

              {childrenState === "loaded" && !hasChildren && (
                <p className="text-[11px] text-slate-500">
                  No children found for this phone yet. Once the school
                  links your phone to your children in EduLife OS, they
                  will appear here. You can still use a student ID as a
                  fallback below.
                </p>
              )}

              {childrenState === "loaded" && hasChildren && (
                <div className="mt-1 space-y-1">
                  {children.map((child) => {
                    const isSelected = child.id === selectedChildId;
                    const name = getChildName(child);
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => setSelectedChildId(child.id)}
                        className={[
                          "flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs transition",
                          isSelected
                            ? "border-emerald-500 bg-emerald-50/70"
                            : "border-slate-200 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/60",
                        ].join(" ")}
                      >
                        <div>
                          <div className="font-medium text-slate-900">
                            {name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {child.classroomName
                              ? `Class: ${child.classroomName}`
                              : "Class: —"}
                          </div>
                        </div>
                        {isSelected && (
                          <span className="rounded-full border border-emerald-500 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Selected
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Manual Student ID fallback */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Student ID (optional fallback)
              </label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Use only if your child list is empty or for testing"
              />
              <p className="text-[11px] text-slate-500">
                If your children do not show up yet, the school can
                give you a Student ID to use here temporarily.
              </p>
            </div>

            {/* Term + academic year */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Term
                </label>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Academic year
                </label>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleOpenTermReport}
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700"
                >
                  Open term report
                </button>
                <button
                  type="button"
                  onClick={handleOpenSmsAlerts}
                  className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
                >
                  Open SMS alerts
                </button>
              </div>

              <p className="mt-2 text-[11px] text-slate-500 sm:mt-0">
                Later, this page will also show quick cards for fees,
                attendance, and health for each child.
              </p>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
};

export default ParentHomePage;
