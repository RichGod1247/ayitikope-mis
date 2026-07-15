//src/components/governance/GovernanceNoticeRecipientPicker.tsx
"use client";

import { useState } from "react";

export type GovernanceNoticeRecipientPickerRole =
  | "SISSO"
  | "HEADTEACHER"
  | "TEACHER";

export type GovernanceNoticeRecipientPickerSector =
  | "PUBLIC"
  | "PRIVATE"
  | "ALL_AUTHORIZED";

export type GovernanceNoticeRecipientPickerItem = {
  selectionId: string;
  userId: string;
  displayName: string;
  roleLabel: string;
  recipientType: string;
  tenantId: string | null;
  school: {
    id: string;
    name: string;
    schoolCode: string | null;
    schoolSector: string | null;
  } | null;
  zone: {
    id: string;
    name: string;
    zoneTypeName: string | null;
  } | null;
  staffId: string | null;
  delivery: {
    inApp: boolean;
    sms: boolean;
    email: boolean;
  };
};

export type GovernanceNoticeVerifiedRecipients = {
  selectionIds: string[];
  items: GovernanceNoticeRecipientPickerItem[];
  deliverySummary: {
    inApp: number;
    sms: number;
    email: number;
    missingSms: number;
    missingEmail: number;
  };
};

type SearchResponse =
  | {
      ok: true;
      reqId: string;
      query: string;
      role: string | null;
      sectorTarget: GovernanceNoticeRecipientPickerSector;
      items: GovernanceNoticeRecipientPickerItem[];
      count: number;
      limit: number;
      minimumQueryLength: number;
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
    };

type PreviewResponse =
  | {
      ok: true;
      reqId: string;
      sectorTarget: GovernanceNoticeRecipientPickerSector;
      items: GovernanceNoticeRecipientPickerItem[];
      count: number;
      deliverySummary: {
        inApp: number;
        sms: number;
        email: number;
        missingSms: number;
        missingEmail: number;
      };
      limits: {
        maxSelectedRecipients: number;
      };
    }
  | {
      ok: false;
      reqId?: string;
      error: string;
    };

function roleLabel(role: GovernanceNoticeRecipientPickerRole) {
  if (role === "SISSO") return "SISSOs / Circuit Supervisors";
  if (role === "HEADTEACHER") return "Headteachers";
  return "Teachers";
}

function locationLabel(item: GovernanceNoticeRecipientPickerItem) {
  if (item.school) {
    return `${item.school.name}${
      item.school.schoolCode ? ` · ${item.school.schoolCode}` : ""
    }`;
  }

  if (item.zone) {
    return `${item.zone.name}${
      item.zone.zoneTypeName ? ` · ${item.zone.zoneTypeName}` : ""
    }`;
  }

  return "Authorized governance scope";
}

function recipientErrorMessage(code: string) {
  if (code === "RECIPIENT_SEARCH_QUERY_TOO_SHORT") {
    return "Enter at least two characters before searching.";
  }

  if (code === "RECIPIENT_SEARCH_SCHOOL_OUT_OF_SCOPE") {
    return "That school is outside your authorized area.";
  }

  if (code === "RECIPIENT_ROLE_FILTER_FORBIDDEN") {
    return "You are not authorized to search that staff group.";
  }

  if (code === "RECIPIENT_SELECTION_IDS_REQUIRED") {
    return "Select at least one person before checking recipients.";
  }

  if (code === "RECIPIENT_SELECTION_LIMIT_EXCEEDED") {
    return "A maximum of 50 people may be selected.";
  }

  if (code === "SELECTED_RECIPIENT_OUT_OF_SCOPE_OR_INACTIVE") {
    return "One or more selected people are no longer active or authorized. Remove them and search again.";
  }

  if (
    code === "DUPLICATE_RECIPIENT_SELECTION" ||
    code === "DUPLICATE_SELECTED_RECIPIENT_USER"
  ) {
    return "The same person was selected more than once.";
  }

  if (code === "INVALID_RECIPIENT_SELECTION_ID") {
    return "One selected recipient could not be verified. Remove the person and search again.";
  }

  return "The recipient check could not be completed. Check the connection and try once more.";
}

export default function GovernanceNoticeRecipientPicker({
  role,
  sectorTarget,
  tenantId,
  onVerifiedChange,
}: {
  role: GovernanceNoticeRecipientPickerRole;
  sectorTarget: GovernanceNoticeRecipientPickerSector;
  tenantId?: string;
  onVerifiedChange: (
    value: GovernanceNoticeVerifiedRecipients | null,
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    GovernanceNoticeRecipientPickerItem[]
  >([]);
  const [selected, setSelected] = useState<
    GovernanceNoticeRecipientPickerItem[]
  >([]);

  const [searchBusy, setSearchBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [verified, setVerified] =
    useState<GovernanceNoticeVerifiedRecipients | null>(null);

  function clearVerification() {
    setVerified(null);
    onVerifiedChange(null);
  }

  async function searchRecipients() {
    const cleanQuery = query.trim();

    setError(null);
    setSearchMessage(null);

    if (cleanQuery.length < 2) {
      setError("Enter at least two characters before searching.");
      return;
    }

    setSearchBusy(true);

    try {
      const params = new URLSearchParams({
        q: cleanQuery,
        role,
        sectorTarget,
        take: "20",
      });

      if (tenantId) {
        params.set("tenantId", tenantId);
      }

      const response = await fetch(
        `/api/governance/notices/recipients/search?${params.toString()}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const json = (await response.json().catch(() => null)) as
        | SearchResponse
        | null;

      if (!response.ok || !json?.ok) {
        setResults([]);
        setError(
          json && !json.ok
            ? recipientErrorMessage(json.error)
            : `Recipient search failed (${response.status}).`,
        );
        return;
      }

      setResults(json.items);

      setSearchMessage(
        json.count
          ? `${json.count} matching person${
              json.count === 1 ? "" : "s"
            } found.`
          : "No matching person was found. Check the spelling or Staff ID.",
      );
    } catch {
      setResults([]);
      setError(
        "The search could not reach EduLife OS. Check the connection and press Search again.",
      );
    } finally {
      setSearchBusy(false);
    }
  }

  function selectRecipient(item: GovernanceNoticeRecipientPickerItem) {
    setError(null);

    if (
      selected.some(
        (current) => current.selectionId === item.selectionId,
      )
    ) {
      return;
    }

    if (selected.length >= 50) {
      setError("A maximum of 50 people may be selected.");
      return;
    }

    setSelected((current) => [...current, item]);
    clearVerification();
  }

  function removeRecipient(selectionId: string) {
    setSelected((current) =>
      current.filter((item) => item.selectionId !== selectionId),
    );
    clearVerification();
  }

  async function previewRecipients() {
    setError(null);

    if (!selected.length) {
      setError("Select at least one person before checking recipients.");
      return;
    }

    setPreviewBusy(true);

    try {
      const response = await fetch(
        "/api/governance/notices/recipients/preview",
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            selectionIds: selected.map((item) => item.selectionId),
            sectorTarget,
          }),
        },
      );

      const json = (await response.json().catch(() => null)) as
        | PreviewResponse
        | null;

      if (!response.ok || !json?.ok) {
        clearVerification();
        setError(
          json && !json.ok
            ? recipientErrorMessage(json.error)
            : `Recipient check failed (${response.status}).`,
        );
        return;
      }

      const verifiedValue: GovernanceNoticeVerifiedRecipients = {
        selectionIds: json.items.map((item) => item.selectionId),
        items: json.items,
        deliverySummary: json.deliverySummary,
      };

      setSelected(json.items);
      setVerified(verifiedValue);
      onVerifiedChange(verifiedValue);
    } catch {
      clearVerification();
      setError(
        "The recipient check could not reach EduLife OS. Your selections remain here. Check the connection and try again.",
      );
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-indigo-300/20 bg-indigo-500/10 p-3 sm:p-4">
      <h4 className="text-sm font-bold text-white">
        Find specific people
      </h4>

      <p className="mt-1 text-xs leading-5 text-indigo-100/75">
        Search within {roleLabel(role)}. Searching happens only when you
        press the Search button.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">
            Name, Staff ID or school
          </span>

          <input
            value={query}
            maxLength={160}
            onChange={(event) => {
              setQuery(event.target.value);
              setError(null);
              setSearchMessage(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void searchRecipients();
              }
            }}
            placeholder="Enter name, Staff ID or school"
            className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-300/50"
          />
        </label>

        <button
          type="button"
          onClick={() => void searchRecipients()}
          disabled={searchBusy}
          className="min-h-12 rounded-2xl border border-indigo-300/30 bg-indigo-500/25 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500/35 disabled:cursor-wait disabled:opacity-60"
        >
          {searchBusy ? "Searching…" : "Search"}
        </button>
      </div>

      {searchMessage ? (
        <p className="mt-2 text-xs text-slate-300">
          {searchMessage}
        </p>
      ) : null}

      {results.length ? (
        <div className="mt-3 space-y-2">
          {results.map((item) => {
            const alreadySelected = selected.some(
              (current) =>
                current.selectionId === item.selectionId,
            );

            return (
              <article
                key={item.selectionId}
                className="rounded-2xl border border-white/10 bg-slate-950/35 p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-white">
                      {item.displayName}
                    </p>

                    <p className="mt-1 text-xs text-slate-300">
                      {item.roleLabel} · {locationLabel(item)}
                    </p>

                    {item.staffId ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Staff ID: {item.staffId}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    disabled={alreadySelected}
                    onClick={() => selectRecipient(item)}
                    className="min-h-11 shrink-0 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white hover:bg-white/[0.1] disabled:cursor-default disabled:opacity-60"
                  >
                    {alreadySelected ? "Selected" : "Select"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <section className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-white">
              Selected people
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {selected.length} of 50 selected
            </p>
          </div>

          <button
            type="button"
            onClick={() => void previewRecipients()}
            disabled={previewBusy || !selected.length}
            className="min-h-11 rounded-xl border border-emerald-300/25 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {previewBusy
              ? "Checking…"
              : "Check selected people"}
          </button>
        </div>

        {selected.length ? (
          <div className="mt-3 space-y-2">
            {selected.map((item) => (
              <div
                key={item.selectionId}
                className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words text-xs font-semibold text-white">
                    {item.displayName}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {item.roleLabel} · {locationLabel(item)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    removeRecipient(item.selectionId)
                  }
                  className="min-h-9 shrink-0 rounded-lg border border-red-300/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/20"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            No specific person has been selected.
          </p>
        )}
      </section>

      {verified ? (
        <div
          role="status"
          className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3"
        >
          <p className="text-sm font-bold text-emerald-100">
            {verified.items.length} recipient
            {verified.items.length === 1 ? "" : "s"} verified
          </p>

          <p className="mt-1 text-xs leading-5 text-emerald-100/80">
            EduLife OS delivery: {verified.deliverySummary.inApp} · SMS
            available: {verified.deliverySummary.sms} · Email available:{" "}
            {verified.deliverySummary.email}
          </p>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-3 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-xs leading-5 text-red-100"
        >
          {error}
        </div>
      ) : null}
    </section>
  );
}