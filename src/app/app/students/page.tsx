import { prisma } from "../../../lib/prisma";
import StudentsClient from "./StudentsClient";

type ClassroomLite = { id: string; name: string };

async function getTenant() {
  const tenant = await prisma.tenant.findFirst({
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) throw new Error("No tenant found");
  return tenant;
}

type StudentRow = {
  id: string;
  firstName: string;
  lastName: string;
  sex: string | null;
  dob: Date | null;
  guardianName: string | null;
  guardianPhone: string | null;
  classroomId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export default async function StudentsPage() {
  const tenant = await getTenant();

  const classrooms = await prisma.classroom.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }],
  });

  const rows: StudentRow[] = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sex: true,
      dob: true,
      guardianName: true,
      guardianPhone: true,
      classroomId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const items = rows.map((s: StudentRow) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    sex: s.sex ?? null,
    dob: s.dob ? s.dob.toISOString() : null,
    guardianName: s.guardianName ?? null,
    guardianPhone: s.guardianPhone ?? null,
    classroomId: s.classroomId ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Students</h1>
        <p className="text-sm text-gray-500">
          Tenant: {tenant.name} ({tenant.slug})
        </p>
      </div>

      <StudentsClient
        items={items}
        tenantSlug={tenant.slug}
        classrooms={classrooms as ClassroomLite[]}
      />
    </div>
  );
}
