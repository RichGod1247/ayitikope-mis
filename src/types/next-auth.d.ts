// src/types/next-auth.d.ts
import "next-auth";
import "next-auth/jwt";
import type { DefaultSession } from "next-auth";

type TeacherScope = {
  phase: string | null;
  classLevel: string | null;
  jhsAssignments: any; // keep json flexible
};

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      staffId: string | null;
      tenantId: string | null;
      roleName: string | null;
      teacherScope?: TeacherScope | null;
    };
  }

  interface User {
    id: string;
    staffId?: string | null;
    tenantId?: string | null;
    roleName?: string | null;
    teacherScope?: TeacherScope | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    staffId?: string | null;
    tenantId?: string | null;
    roleName?: string | null;
    teacherScope?: TeacherScope | null;
  }
}

export {};
