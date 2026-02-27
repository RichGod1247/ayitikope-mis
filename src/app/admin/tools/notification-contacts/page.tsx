import { Suspense } from "react";
import ContactsClient from "./ContactsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function NotificationContactsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-sm text-slate-600">Loading contacts…</div>
        </div>
      }
    >
      <ContactsClient />
    </Suspense>
  );
}
