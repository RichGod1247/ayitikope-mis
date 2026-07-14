//src/components/governance/GovernanceNoticeAttachmentList.tsx
"use client";

import { useState } from "react";

export type GovernanceNoticeAttachmentItem = {
  id: string;
  displayFilename: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hash: string | null;
  confidential: boolean;
  recipientVisible: boolean;
  status: string;
  scanStatus: string;
  sealedAt: string | null;
  createdAt: string;
};

type DownloadResponse =
  | {
      ok: true;
      item?: {
        attachmentId?: string;
        noticeId?: string;
        displayFilename?: string;
        downloadUrl?: string;
        expiresInSeconds?: number;
        authorizationBasis?: string;
      };
    }
  | {
      ok: false;
      error: string;
    };

type Props = {
  attachments: GovernanceNoticeAttachmentItem[];
  heading?: string;
  showVisibility?: boolean;
  className?: string;
};

function formatFileSize(value: number) {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Size unavailable";
  }

  if (bytes < 1024) {
    return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(
      kilobytes >= 100 ? 0 : 1,
    )} KB`;
  }

  const megabytes = kilobytes / 1024;

  return `${megabytes.toFixed(
    megabytes >= 10 ? 1 : 2,
  )} MB`;
}

function fileTypeLabel(
  attachment: GovernanceNoticeAttachmentItem,
) {
  const extension = String(
    attachment.extension ?? "",
  )
    .trim()
    .replace(/^\./, "")
    .toUpperCase();

  if (extension) return extension;

  const mimeType = String(
    attachment.mimeType ?? "",
  ).trim();

  return mimeType || "Document";
}

function userFacingDownloadError(
  status: number,
) {
  if (status === 401) {
    return "Your session has expired. Sign in again, then retry.";
  }

  if (status === 404) {
    return "This document is unavailable or you no longer have access.";
  }

  return "The document could not be prepared. Check your connection and retry.";
}

export default function GovernanceNoticeAttachmentList({
  attachments,
  heading,
  showVisibility = false,
  className = "",
}: Props) {
  const [busyId, setBusyId] =
    useState<string | null>(null);

  const [errors, setErrors] = useState<
    Record<string, string>
  >({});

  if (!attachments.length) {
    return null;
  }

  async function downloadAttachment(
    attachment: GovernanceNoticeAttachmentItem,
  ) {
    if (busyId) return;

    setBusyId(attachment.id);

    setErrors((current) => {
      const next = { ...current };
      delete next[attachment.id];
      return next;
    });

    try {
      const response = await fetch(
        `/api/governance/notices/attachments/${encodeURIComponent(
          attachment.id,
        )}/download`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const result = (await response
        .json()
        .catch(() => null)) as
        | DownloadResponse
        | null;

      const downloadUrl =
        result?.ok === true
          ? String(
              result.item?.downloadUrl ?? "",
            ).trim()
          : "";

      if (
        !response.ok ||
        result?.ok !== true ||
        !downloadUrl
      ) {
        setErrors((current) => ({
          ...current,
          [attachment.id]:
            userFacingDownloadError(
              response.status,
            ),
        }));

        return;
      }

      const link =
        document.createElement("a");

      link.href = downloadUrl;
      link.rel = "noopener noreferrer";
      link.style.display = "none";

      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setErrors((current) => ({
        ...current,
        [attachment.id]:
          "The document could not be prepared. Check your connection and retry.",
      }));
    } finally {
      setBusyId(null);
    }
  }

  const resolvedHeading =
    heading ??
    (attachments.length === 1
      ? "Attached document"
      : "Attached documents");

  return (
    <section
      className={`mt-4 rounded-2xl border border-sky-300/20 bg-sky-400/[0.06] p-4 ${className}`}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">
          {resolvedHeading}
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-400">
          Documents remain private. Access is checked
          when Download document is pressed.
        </p>
      </div>

      <div className="mt-3 space-y-3">
        {attachments.map((attachment) => {
          const isBusy =
            busyId === attachment.id;

          const error =
            errors[attachment.id] ?? null;

          return (
            <div
              key={attachment.id}
              className="rounded-2xl border border-white/10 bg-[#05070B] p-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-lg"
                    >
                      📄
                    </span>

                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-white">
                        {attachment.displayFilename}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        {fileTypeLabel(attachment)}
                        {" · "}
                        {formatFileSize(
                          attachment.sizeBytes,
                        )}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {attachment.confidential ? (
                          <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold text-amber-100">
                            Private document
                          </span>
                        ) : null}

                        {showVisibility ? (
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                              attachment.recipientVisible
                                ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                                : "border-slate-300/20 bg-white/5 text-slate-300"
                            }`}
                          >
                            {attachment.recipientVisible
                              ? "Visible to recipients"
                              : "Sender record only"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void downloadAttachment(
                      attachment,
                    )
                  }
                  disabled={Boolean(busyId)}
                  aria-busy={isBusy}
                  className="min-h-12 w-full shrink-0 rounded-2xl border border-sky-300/30 bg-sky-400/12 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-55 sm:w-auto"
                >
                  {isBusy
                    ? "Preparing document..."
                    : "Download document"}
                </button>
              </div>

              {error ? (
                <div
                  role="alert"
                  className="mt-3 rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-xs leading-5 text-red-100"
                >
                  {error}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}