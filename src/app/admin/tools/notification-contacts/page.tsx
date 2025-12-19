import { prisma } from "@/lib/prisma";
import ContactsClient from "@/app/admin/tools/notification-contacts/ContactsClient";

export type NotificationContactDTO = {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  createdAt: string | null;
  createdAtDisplay: string;
};

export default async function NotificationContactsPage() {
  const contacts = await prisma.notificationContact.findMany({
    orderBy: { id: "asc" },
  });

  const plain: NotificationContactDTO[] = contacts.map((c) => ({
    id: String(c.id),
    name: c.name,
    phone: c.phone,
    isActive: c.isActive,
    // raw ISO string if you ever need it for logic
    createdAt: c.createdAt ? c.createdAt.toISOString() : null,
    // human-readable string computed once on the server
    createdAtDisplay: c.createdAt
      ? c.createdAt.toLocaleString() // Node decides the format; stays fixed as plain text
      : "—",
  }));

  return <ContactsClient initialContacts={plain} />;
}
