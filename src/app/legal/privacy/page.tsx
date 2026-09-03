// src/app/legal/privacy/page.tsx
import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { PRIVACY_NOTICE_UAT } from "@/lib/legal/publishedDocuments";

export const metadata: Metadata = {
  title: "Privacy Notice",
  description: "EduLife OS Privacy Notice for controlled UAT acceptance testing.",
};

export default function PrivacyNoticePage() {
  return (
    <LegalDocumentPage
      document={PRIVACY_NOTICE_UAT}
      alternateHref="/legal/terms"
      alternateLabel="Terms of Service"
    />
  );
}
