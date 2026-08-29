export type StudentClassroomOption = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function studentClassroomDisplayLabel(c: Pick<StudentClassroomOption, "name" | "grade" | "arm">) {
  const name = clean(c.name);
  const grade = clean(c.grade);
  const arm = clean(c.arm);

  if (name && grade) {
    const same = name.toUpperCase() === grade.toUpperCase();
    if (same) return `${name}${arm ? ` · Arm ${arm}` : ""}`;
    return `${name} · ${grade}${arm ? ` · Arm ${arm}` : ""}`;
  }

  if (name) return `${name}${arm ? ` · Arm ${arm}` : ""}`;
  if (grade) return `${grade}${arm ? ` · Arm ${arm}` : ""}`;
  return "Class";
}

function normalizeStageBucket(raw: unknown): string | null {
  const compact = clean(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;

  let match = compact.match(/^KG([12])(?:[A-Z].*)?$/) || compact.match(/^KINDERGARTEN([12])(?:[A-Z].*)?$/);
  if (match) return `KG ${match[1]}`;

  match = compact.match(/^(PRIMARY|PRI|P)([1-6])(?:[A-Z].*)?$/);
  if (match) return `PRIMARY ${match[2]}`;

  match = compact.match(/^(BASIC|B)([1-9])(?:[A-Z].*)?$/);
  if (match) {
    const n = Number(match[2]);
    if (n >= 1 && n <= 6) return `PRIMARY ${n}`;
    if (n === 7) return "JHS 1";
    if (n === 8) return "JHS 2";
    if (n === 9) return "JHS 3";
  }

  match = compact.match(/^JHS([1-3])(?:[A-Z].*)?$/);
  if (match) return `JHS ${match[1]}`;

  return null;
}

function stageBucket(c: Pick<StudentClassroomOption, "name" | "grade">) {
  return normalizeStageBucket(c.grade) ?? normalizeStageBucket(c.name);
}

export function hasStudentMultiStreamClasses(classes: StudentClassroomOption[]) {
  const seen = new Set<string>();

  for (const cls of classes) {
    const bucket = stageBucket(cls);
    if (!bucket) continue;
    if (seen.has(bucket)) return true;
    seen.add(bucket);
  }

  return false;
}

function pickSingleStreamRepresentative(group: StudentClassroomOption[], preferredId: string | null) {
  const preferred = preferredId ? group.find((item) => item.id === preferredId) ?? null : null;
  if (preferred && !clean(preferred.arm)) return preferred;

  const armLess = group
    .filter((item) => !clean(item.arm))
    .sort((a, b) => studentClassroomDisplayLabel(a).localeCompare(studentClassroomDisplayLabel(b)));

  if (armLess.length > 0) return armLess[0];
  if (preferred) return preferred;

  return [...group].sort((a, b) =>
    studentClassroomDisplayLabel(a).localeCompare(studentClassroomDisplayLabel(b))
  )[0];
}

export function buildSingleStreamStudentClasses(classes: StudentClassroomOption[], preferredId: string | null) {
  const orderedBuckets = [
    "KG 1",
    "KG 2",
    "PRIMARY 1",
    "PRIMARY 2",
    "PRIMARY 3",
    "PRIMARY 4",
    "PRIMARY 5",
    "PRIMARY 6",
    "JHS 1",
    "JHS 2",
    "JHS 3",
  ] as const;

  const grouped = new Map<string, StudentClassroomOption[]>();
  const others: StudentClassroomOption[] = [];

  for (const cls of classes) {
    const bucket = stageBucket(cls);
    if (!bucket) {
      others.push(cls);
      continue;
    }

    const rows = grouped.get(bucket) ?? [];
    rows.push(cls);
    grouped.set(bucket, rows);
  }

  const picked: StudentClassroomOption[] = [];

  for (const bucket of orderedBuckets) {
    const group = grouped.get(bucket) ?? [];
    if (!group.length) continue;
    const representative = pickSingleStreamRepresentative(group, preferredId);
    if (representative) picked.push(representative);
  }

  return [
    ...picked,
    ...others.sort((a, b) => studentClassroomDisplayLabel(a).localeCompare(studentClassroomDisplayLabel(b))),
  ];
}
