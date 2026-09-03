// src/app/legal/terms/page.tsx
import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { TERMS_OF_SERVICE_UAT } from "@/lib/legal/publishedDocuments";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "EduLife OS Terms of Service for controlled UAT acceptance testing.",
};

export default function TermsOfServicePage() {
  return (
    <LegalDocumentPage
      document={TERMS_OF_SERVICE_UAT}
      alternateHref="/legal/privacy"
      alternateLabel="Privacy Notice"
    />
  );
}
