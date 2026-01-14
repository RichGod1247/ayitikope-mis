import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), "prisma", ".env") });

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CURRICULUM_DIR = path.join(__dirname, "curriculum");
const FILE_NAME = "basic-6-religious-and-moral-education.json";

type ExemplarJson = { orderIndex: number; description: string };
type IndicatorJson = {
  code: string;
  description: string;
  orderIndex: number;
  exemplars?: ExemplarJson[];
};
type ContentStandardJson = {
  code: string;
  description: string;
  orderIndex: number;
  indicators?: IndicatorJson[];
};
type SubStrandJson = {
  code: string;
  title: string;
  description?: string;
  orderIndex: number;
  contentStandards?: ContentStandardJson[];
};
type StrandJson = {
  code: string;
  title: string;
  description?: string;
  orderIndex: number;
  subStrands?: SubStrandJson[];
};
type SubjectJson = {
  phase: string;
  level: string;
  subject?: string; // <-- label only (NOT in Prisma model)
  name: string;
  slug: string;
  orderIndex: number;
  description?: string;
  strands?: StrandJson[];
};

function logDbTarget() {
  const raw = process.env.DATABASE_URL || "";
  try {
    const u = new URL(raw);
    const user = u.username || "(unknown-user)";
    const host = u.hostname || "(unknown-host)";
    const port = u.port || "(no-port)";
    console.log(`🔌 DB target: ${host}:${port} | user: ${user}`);
  } catch {
    console.log("🔌 DB target: (could not parse DATABASE_URL)");
  }
}

async function upsertSubject(s: SubjectJson) {
  const existing = await prisma.curriculumSubject.findFirst({
    where: { slug: s.slug },
    select: { id: true },
  });

  if (existing) {
    await prisma.curriculumSubject.update({
      where: { id: existing.id },
      data: {
        name: s.name,
        slug: s.slug,
        phase: s.phase,
        level: s.level,
        orderIndex: s.orderIndex,
        description: s.description ?? undefined,
      },
      select: { id: true },
    });
    return { id: existing.id, created: false };
  }

  const created = await prisma.curriculumSubject.create({
    data: {
      name: s.name,
      slug: s.slug,
      phase: s.phase,
      level: s.level,
      orderIndex: s.orderIndex,
      description: s.description ?? undefined,
    },
    select: { id: true },
  });

  return { id: created.id, created: true };
}

async function upsertStrand(subjectId: string, st: StrandJson) {
  const existing = await prisma.curriculumStrand.findFirst({
    where: { code: st.code, subjectId },
    select: { id: true },
  });

  if (existing) {
    await prisma.curriculumStrand.update({
      where: { id: existing.id },
      data: {
        title: st.title,
        description: st.description ?? undefined,
        orderIndex: st.orderIndex,
      },
      select: { id: true },
    });
    return { id: existing.id, created: false };
  }

  const created = await prisma.curriculumStrand.create({
    data: {
      code: st.code,
      title: st.title,
      description: st.description ?? undefined,
      orderIndex: st.orderIndex,
      subject: { connect: { id: subjectId } },
    },
    select: { id: true },
  });

  return { id: created.id, created: true };
}

async function upsertSubStrand(strandId: string, ss: SubStrandJson) {
  const existing = await prisma.curriculumSubStrand.findFirst({
    where: { code: ss.code, strandId },
    select: { id: true },
  });

  if (existing) {
    await prisma.curriculumSubStrand.update({
      where: { id: existing.id },
      data: {
        title: ss.title,
        description: ss.description ?? undefined,
        orderIndex: ss.orderIndex,
      },
      select: { id: true },
    });
    return { id: existing.id, created: false };
  }

  const created = await prisma.curriculumSubStrand.create({
    data: {
      code: ss.code,
      title: ss.title,
      description: ss.description ?? undefined,
      orderIndex: ss.orderIndex,
      strand: { connect: { id: strandId } },
    },
    select: { id: true },
  });

  return { id: created.id, created: true };
}

async function upsertContentStandard(subStrandId: string, cs: ContentStandardJson) {
  const existing = await prisma.curriculumContentStandard.findFirst({
    where: { code: cs.code, subStrandId },
    select: { id: true },
  });

  if (existing) {
    await prisma.curriculumContentStandard.update({
      where: { id: existing.id },
      data: {
        description: cs.description,
        orderIndex: cs.orderIndex,
      },
      select: { id: true },
    });
    return { id: existing.id, created: false };
  }

  const created = await prisma.curriculumContentStandard.create({
    data: {
      code: cs.code,
      description: cs.description,
      orderIndex: cs.orderIndex,
      subStrand: { connect: { id: subStrandId } },
    },
    select: { id: true },
  });

  return { id: created.id, created: true };
}

async function upsertIndicator(contentStandardId: string, i: IndicatorJson) {
  const existing = await prisma.curriculumIndicator.findFirst({
    where: { code: i.code, contentStandardId },
    select: { id: true },
  });

  if (existing) {
    await prisma.curriculumIndicator.update({
      where: { id: existing.id },
      data: {
        description: i.description,
        orderIndex: i.orderIndex,
      },
      select: { id: true },
    });
    return { id: existing.id, created: false };
  }

  const created = await prisma.curriculumIndicator.create({
    data: {
      code: i.code,
      description: i.description,
      orderIndex: i.orderIndex,
      contentStandard: { connect: { id: contentStandardId } },
    },
    select: { id: true },
  });

  return { id: created.id, created: true };
}

async function upsertExemplar(indicatorId: string, ex: ExemplarJson) {
  // safest identity: indicatorId + orderIndex
  const existing = await prisma.curriculumExemplar.findFirst({
    where: { indicatorId, orderIndex: ex.orderIndex },
    select: { id: true },
  });

  if (existing) {
    await prisma.curriculumExemplar.update({
      where: { id: existing.id },
      data: { description: ex.description },
      select: { id: true },
    });
    return { created: false };
  }

  await prisma.curriculumExemplar.create({
    data: {
      orderIndex: ex.orderIndex,
      description: ex.description,
      indicator: { connect: { id: indicatorId } },
    },
    select: { id: true },
  });

  return { created: true };
}

async function main() {
  logDbTarget();

  console.log("📦 Seeding 6 Religious and Moral Education from JSON in:", CURRICULUM_DIR);

  const fullPath = path.join(CURRICULUM_DIR, FILE_NAME);
  if (!fs.existsSync(fullPath)) {
    console.error("❌ Basic 6 R.M.E JSON file not found:", fullPath);
    process.exit(1);
  }

  console.log("📖 Loading Basic 6 R.M.E from:", fullPath);

  const raw = fs.readFileSync(fullPath, "utf8");
  const subject: SubjectJson = JSON.parse(raw);

  let subjectCreated = 0;
  let subjectUpdated = 0;
  let strands = 0;
  let subStrands = 0;
  let contentStandards = 0;
  let indicators = 0;
  let exemplars = 0;

  const subj = await upsertSubject(subject);
  if (subj.created) subjectCreated++;
  else subjectUpdated++;

  console.log(`→ Subject: ${subject.name} (${subject.slug}) [${subj.created ? "create" : "update"}]`);

  for (const st of subject.strands ?? []) {
    const stRes = await upsertStrand(subj.id, st);
    strands++;

    for (const ss of st.subStrands ?? []) {
      const ssRes = await upsertSubStrand(stRes.id, ss);
      subStrands++;

      for (const cs of ss.contentStandards ?? []) {
        const csRes = await upsertContentStandard(ssRes.id, cs);
        contentStandards++;

        for (const ind of cs.indicators ?? []) {
          const indRes = await upsertIndicator(csRes.id, ind);
          indicators++;

          for (const ex of ind.exemplars ?? []) {
            const exRes = await upsertExemplar(indRes.id, ex);
            exemplars++;
            void exRes; // silence lint
          }
        }
      }
    }
  }

  console.log("🎉 Done seeding Basic 6 R.M.E curriculum.");
  console.log({
    subjectCreated,
    subjectUpdated,
    strands,
    subStrands,
    contentStandards,
    indicators,
    exemplars,
  });
}

main()
  .catch((e) => {
    console.error("❌ Error seeding Basic 6 R.M.E:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
