// src/components/AdminHealthSettingsClient.tsx
"use client";

import React, { useEffect, useState } from "react";

type AdminHealthSettingsClientProps = {
  tenantId: string;
};

type HealthSettings = {
  feverThresholdC: number;
  notifyParentsOnFever: boolean;
  notifyHealthCenterOnFever: boolean;
  healthCenterName: string;
  healthCenterPhone: string;
};

type LoadState = "idle" | "loading" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

const AdminHealthSettingsClient: React.FC<AdminHealthSettingsClientProps> = ({
  tenantId,
}) => {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const [feverThresholdC, setFeverThresholdC] = useState<string>("38.0");
  const [notifyParentsOnFever, setNotifyParentsOnFever] =
    useState<boolean>(true);
  const [notifyHealthCenterOnFever, setNotifyHealthCenterOnFever] =
    useState<boolean>(false);
  const [healthCenterName, setHealthCenterName] = useState<string>("");
  const [healthCenterPhone, setHealthCenterPhone] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoadState("loading");
        setError(null);

        const res = await fetch("/api/admin/health/settings");
        if (!res.ok) {
          const text = await res.text();
          console.error(
            "[AdminHealthSettingsClient] load error",
            res.status,
            text
          );
          setLoadState("error");
          setError("Failed to load health settings.");
          return;
        }

        const data = await res.json();
        if (!data.ok) {
          console.error(
            "[AdminHealthSettingsClient] load payload not ok",
            data
          );
          setLoadState("error");
          setError("Failed to load health settings.");
          return;
        }

        const hs = data.healthSettings as HealthSettings;
        setFeverThresholdC(
          typeof hs.feverThresholdC === "number"
            ? hs.feverThresholdC.toString()
            : "38.0"
        );
        setNotifyParentsOnFever(!!hs.notifyParentsOnFever);
        setNotifyHealthCenterOnFever(!!hs.notifyHealthCenterOnFever);
        setHealthCenterName(hs.healthCenterName ?? "");
        setHealthCenterPhone(hs.healthCenterPhone ?? "");

        setLoadState("idle");
      } catch (err) {
        console.error("[AdminHealthSettingsClient] load exception", err);
        setLoadState("error");
        setError("Failed to load health settings.");
      }
    };

    load();
  }, [tenantId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const thresholdNumber = Number(feverThresholdC);
    if (
      !Number.isFinite(thresholdNumber) ||
      thresholdNumber <= 30 ||
      thresholdNumber >= 45
    ) {
      setError("Please set a reasonable fever threshold between 30 and 45 °C.");
      return;
    }

    setSaveState("saving");
    setError(null);
    try {
      const body = {
        healthSettings: {
          feverThresholdC: thresholdNumber,
          notifyParentsOnFever,
          notifyHealthCenterOnFever,
          healthCenterName: healthCenterName.trim(),
          healthCenterPhone: healthCenterPhone.trim(),
        },
      };

      const res = await fetch("/api/admin/health/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        console.error("[AdminHealthSettingsClient] save error", data);
        setSaveState("error");
        setError(
          data?.error || "Failed to save health settings. Please try again."
        );
        return;
      }

      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch (err) {
      console.error("[AdminHealthSettingsClient] save exception", err);
      setSaveState("error");
      setError("Failed to save health settings. Please try again.");
    }
  };

  if (loadState === "loading") {
    return (
      <div className="p-4 text-sm text-slate-600">
        Loading health settings…
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="p-4 text-sm text-red-600">
        {error ?? "Failed to load health settings. Please refresh the page."}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-base font-semibold text-slate-900 sm:text-lg">
          Health & Wellbeing Settings
        </h1>
        <p className="text-xs text-slate-600 sm:text-sm">
          Configure how EduLife OS interprets fever and when to notify parents
          or health facilities. These settings apply to this school only.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm sm:text-sm"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-slate-700 sm:text-xs">
              Fever threshold (°C)
            </label>
            <input
              type="number"
              step="0.1"
              min={30}
              max={45}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs sm:text-sm"
              value={feverThresholdC}
              onChange={(e) => setFeverThresholdC(e.target.value)}
            />
            <p className="text-[11px] text-slate-500 sm:text-xs">
              Example: 37.8 – 38.0°C. Learners at or above this value will be
              counted as &quot;fever&quot; in dashboards.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-slate-700 sm:text-xs">
              Nearby health facility name
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs sm:text-sm"
              value={healthCenterName}
              onChange={(e) => setHealthCenterName(e.target.value)}
              placeholder="e.g. Akatsi District Hospital"
            />
            <label className="mt-2 block text-[11px] font-medium text-slate-700 sm:text-xs">
              Health facility phone / WhatsApp
            </label>
            <input
              type="tel"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs sm:text-sm"
              value={healthCenterPhone}
              onChange={(e) => setHealthCenterPhone(e.target.value)}
              placeholder="e.g. 0244 123 456"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
          <label className="flex items-start gap-2 text-[11px] text-slate-700 sm:text-xs">
            <input
              type="checkbox"
              className="mt-0.5 h-3 w-3 rounded border-slate-300 sm:h-3.5 sm:w-3.5"
              checked={notifyParentsOnFever}
              onChange={(e) => setNotifyParentsOnFever(e.target.checked)}
            />
            <span>
              Notify parents automatically (via SMS/WhatsApp, configured later)
              when a learner&apos;s temperature meets or exceeds the threshold.
            </span>
          </label>
          <label className="flex items-start gap-2 text-[11px] text-slate-700 sm:text-xs">
            <input
              type="checkbox"
              className="mt-0.5 h-3 w-3 rounded border-slate-300 sm:h-3.5 sm:w-3.5"
              checked={notifyHealthCenterOnFever}
              onChange={(e) => setNotifyHealthCenterOnFever(e.target.checked)}
            />
            <span>
              Prepare for linking this school to a nearby health facility so
              staff can receive alerts when multiple learners present with fever.
              (Notification wiring will be added in a later phase.)
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="submit"
            disabled={saveState === "saving"}
            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          >
            {saveState === "saving" ? "Saving…" : "Save settings"}
          </button>
          {saveState === "saved" && (
            <span className="text-[11px] text-emerald-600 sm:text-xs">
              Saved.
            </span>
          )}
          {saveState === "error" && (
            <span className="text-[11px] text-red-600 sm:text-xs">
              Failed to save. Please try again.
            </span>
          )}
        </div>
      </form>
    </div>
  );
};

export default AdminHealthSettingsClient;
