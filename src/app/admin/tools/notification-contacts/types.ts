//src/app/admin/tools/notification-contacts/types.ts
export type NotificationContactDTO = {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  createdAt: string | null;
  createdAtDisplay: string;
};
