// src/lib/notifications.ts

import { prisma } from "@/lib/prisma";

export type SmsRecipientMode = "initial" | "full";

export type SmsRecipient = {
  id: string;
  name: string;
  phone: string;
};

/**
 * Fetch SMS recipients from NotificationContact table.
 *
 * - mode: "initial" → first 5 active contacts (your pilot list)
 * - mode: "full"    → all active contacts
 */
export async function getSmsRecipients(
  mode: SmsRecipientMode = "initial"
): Promise<SmsRecipient[]> {
  const contacts = await prisma.notificationContact.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  const selected =
    mode === "initial" ? contacts.slice(0, 5) : contacts;

  return selected
    .map((c) => ({
      id: String(c.id),
      name: c.name ?? "",
      phone: c.phone ?? "",
    }))
    .filter((c) => !!c.phone);
}
