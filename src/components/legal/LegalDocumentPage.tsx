// src/components/legal/LegalDocumentPage.tsx
import Link from "next/link";

import type { PublishedLegalDocument } from "@/lib/legal/publishedDocuments";

type LegalDocumentPageProps = {
  document: PublishedLegalDocument;
  alternateHref: "/legal/terms" | "/legal/privacy";
  alternateLabel: "Terms of Service" | "Privacy Notice";
};

function canonicalBlocks(content: string) {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd().split(/\n{2,}/);
}

function DocumentBlock({ block, index }: { block: string; index: number }) {
  const lines = block.split("\n");
  const firstLine = lines[0] ?? "";
  const remainder = lines.slice(1).join("\n");
  const numberedHeading = /^\d+\.\s/.test(firstLine);
  const namedHeading = firstLine === "UAT STATUS";

  if (index === 0) {
    return (
      <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] px-4 py-4 sm:px-5">
        <p className="text-sm font-bold tracking-[0.04em] text-[#F4D97F]">{firstLine}</p>
        {remainder ? <p className="mt-1 text-xs text-[#C9CDD6]">{remainder}</p> : null}
      </div>
    );
  }

  if (numberedHeading || namedHeading) {
    return (
      <section aria-labelledby={`legal-section-${index}`}>
        <h2
          id={`legal-section-${index}`}
          className="text-base font-bold leading-7 text-[#F7F4ED] sm:text-lg"
        >
          {firstLine}
        </h2>
        {remainder ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#D8DEE9] sm:text-[15px]">
            {remainder}
          </p>
        ) : null}
      </section>
    );
  }

  return <p className="whitespace-pre-wrap text-sm leading-7 text-[#D8DEE9] sm:text-[15px]">{block}</p>;
}

export function LegalDocumentPage({
  document,
  alternateHref,
  alternateLabel,
}: LegalDocumentPageProps) {
  const blocks = canonicalBlocks(document.content);

  return (
    <main className="min-h-screen bg-[#05070B] text-[#F7F4ED]">
      <header className="border-b border-white/10 bg-[#07111F]/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="min-w-0">
            <span className="block text-sm font-bold tracking-[0.02em] text-white">EduLife OS</span>
            <span className="block truncate text-[11px] text-[#9FA8B8]">Hehxagon Technologies</span>
          </Link>
          <Link
            href={alternateHref}
            className="shrink-0 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-[#D8DEE9] transition hover:border-[#D4AF37]/50 hover:text-[#F4D97F]"
          >
            {alternateLabel}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1.5 text-[#F4D97F]">
            Controlled UAT document
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[#AAB2C0]">
            Version {document.version}
          </span>
        </div>

        <section className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(27,102,209,0.16),transparent_36%),rgba(255,255,255,0.035)] p-5 shadow-2xl shadow-black/20 sm:p-8">
          <div className="border-b border-white/10 pb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">EduLife OS legal</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              {document.publicTitle}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#BCC5D3]">
              Published for controlled UAT acceptance testing. This page mirrors the immutable UAT legal document authority.
            </p>
          </div>

          <article className="mt-7 space-y-7" data-document-type={document.documentType} data-document-version={document.version}>
            {blocks.map((block, index) => (
              <DocumentBlock key={`${index}-${block.slice(0, 24)}`} block={block} index={index} />
            ))}
          </article>

          <footer className="mt-9 border-t border-white/10 pt-5">
            <p className="break-all text-[11px] leading-5 text-[#8F99A9]">
              SHA-256: {document.contentHash}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
              <a className="text-[#D8DEE9] underline decoration-white/20 underline-offset-4 hover:text-white" href={`mailto:${document.productSupportEmail}`}>
                {document.productSupportEmail}
              </a>
              <a className="text-[#D8DEE9] underline decoration-white/20 underline-offset-4 hover:text-white" href={`mailto:${document.operatorServiceEmail}`}>
                {document.operatorServiceEmail}
              </a>
            </div>
          </footer>
        </section>

        <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-6 text-[#7F8998]">
          You may review this document before signing in or creating an account.
        </p>
      </div>
    </main>
  );
}
