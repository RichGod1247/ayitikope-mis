import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), "prisma", ".env") });

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  subject?: string; // <-- allowed in JSON, but we DO NOT persist it
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

async function upsertSubject(subj: SubjectJson) {
  const existing = await prisma.curriculumSubject.findFirst({
    where: { slug: subj.slug },
    select: { id: true },
  });

  if (existing) {
    const updated = await prisma.curriculumSubject.update({
      where: { id: existing.id },
      data: {
        name: subj.name,
        slug: subj.slug,
        phase: subj.phase,
        level: subj.level,
        orderIndex: subj.orderIndex,
        description: subj.description,
        // ✅ DO NOT write subj.subject (no such column)
      },
      select: { id: true },
    });
    return { id: updated.id, action: "update" as const };
  }

  const created = await prisma.curriculumSubject.create({
    data: {
      name: subj.name,
      slug: subj.slug,
      phase: subj.phase,
      level: subj.level,
      orderIndex: subj.orderIndex,
      description: subj.description,
      // ✅ DO NOT write subj.subject (no such column)
    },
    select: { id: true },
  });

  return { id: created.id, action: "create" as const };
}

async function upsertStrand(subjectId: string, strand: StrandJson) {
  const existing = await prisma.curriculumStrand.findFirst({
    where: { code: strand.code, subjectId },
    select: { id: true },
  });

  if (existing) {
    return prisma.curriculumStrand.update({
      where: { id: existing.id },
      data: {
        code: strand.code,
        title: strand.title,
        description: strand.description,
        orderIndex: strand.orderIndex,
      },
      select: { id: true },
    });
  }

  return prisma.curriculumStrand.create({
    data: {
      code: strand.code,
      title: strand.title,
      description: strand.description,
      orderIndex: strand.orderIndex,
      subject: { connect: { id: subjectId } },
    },
    select: { id: true },
  });
}

async function upsertSubStrand(strandId: string, ss: SubStrandJson) {
  const existing = await prisma.curriculumSubStrand.findFirst({
    where: { code: ss.code, strandId },
    select: { id: true },
  });

  if (existing) {
    return prisma.curriculumSubStrand.update({
      where: { id: existing.id },
      data: {
        code: ss.code,
        title: ss.title,
        description: ss.description,
        orderIndex: ss.orderIndex,
      },
      select: { id: true },
    });
  }

  return prisma.curriculumSubStrand.create({
    data: {
      code: ss.code,
      title: ss.title,
      description: ss.description,
      orderIndex: ss.orderIndex,
      strand: { connect: { id: strandId } },
    },
    select: { id: true },
  });
}

async function upsertContentStandard(subStrandId: string, cs: ContentStandardJson) {
  const existing = await prisma.curriculumContentStandard.findFirst({
    where: { code: cs.code, subStrandId },
    select: { id: true },
  });

  if (existing) {
    return prisma.curriculumContentStandard.update({
      where: { id: existing.id },
      data: {
        code: cs.code,
        description: cs.description,
        orderIndex: cs.orderIndex,
      },
      select: { id: true },
    });
  }

  return prisma.curriculumContentStandard.create({
    data: {
      code: cs.code,
      description: cs.description,
      orderIndex: cs.orderIndex,
      subStrand: { connect: { id: subStrandId } },
    },
    select: { id: true },
  });
}

async function upsertIndicator(contentStandardId: string, ind: IndicatorJson) {
  const existing = await prisma.curriculumIndicator.findFirst({
    where: { code: ind.code, contentStandardId },
    select: { id: true },
  });

  if (existing) {
    return prisma.curriculumIndicator.update({
      where: { id: existing.id },
      data: {
        code: ind.code,
        description: ind.description,
        orderIndex: ind.orderIndex,
      },
      select: { id: true },
    });
  }

  return prisma.curriculumIndicator.create({
    data: {
      code: ind.code,
      description: ind.description,
      orderIndex: ind.orderIndex,
      contentStandard: { connect: { id: contentStandardId } },
    },
    select: { id: true },
  });
}

async function upsertExemplar(indicatorId: string, ex: ExemplarJson) {
  const existing = await prisma.curriculumExemplar.findFirst({
    where: { indicatorId, orderIndex: ex.orderIndex },
    select: { id: true },
  });

  if (existing) {
    return prisma.curriculumExemplar.update({
      where: { id: existing.id },
      data: { description: ex.description, orderIndex: ex.orderIndex },
      select: { id: true },
    });
  }

  return prisma.curriculumExemplar.create({
    data: {
      orderIndex: ex.orderIndex,
      description: ex.description,
      indicator: { connect: { id: indicatorId } },
    },
    select: { id: true },
  });
}

async function main() {
  logDbTarget();

  const seedPath = path.join(__dirname, "curriculum", "basic-3-religious-and-moral-education.json");
  console.log("📦 Seeding Basic 3 Religious and Moral Education from JSON in:", path.dirname(seedPath));

  if (!fs.existsSync(seedPath)) {
    console.error("❌ Basic 3 R.M.E JSON file not found:", seedPath);
    process.exit(1);
  }

  console.log("📖 Loading Basic 3 R.M.E from:", seedPath);

  const raw = fs.readFileSync(seedPath, "utf8");
  const subj: SubjectJson = JSON.parse(raw);

  const { id: subjectId, action } = await upsertSubject(subj);
  console.log(`→ Subject: ${subj.name} (${subj.slug}) [${action}]`);

  let strands = 0;
  let subStrands = 0;
  let contentStandards = 0;
  let indicators = 0;
  let exemplars = 0;

  for (const strand of subj.strands || []) {
    const s = await upsertStrand(subjectId, strand);
    strands++;

    for (const ss of strand.subStrands || []) {
      const sub = await upsertSubStrand(s.id, ss);
      subStrands++;

      for (const cs of ss.contentStandards || []) {
        const c = await upsertContentStandard(sub.id, cs);
        contentStandards++;

        for (const ind of cs.indicators || []) {
          const i = await upsertIndicator(c.id, ind);
          indicators++;

          for (const ex of ind.exemplars || []) {
            await upsertExemplar(i.id, ex);
            exemplars++;
          }
        }
      }
    }
  }

  console.log("🎉 Done seeding Basic 3 R.M.E curriculum.");
  console.log({
    subjectCreated: action === "create" ? 1 : 0,
    subjectUpdated: action === "update" ? 1 : 0,
    strands,
    subStrands,
    contentStandards,
    indicators,
    exemplars,
  });
}

main()
  .catch((e) => {
    console.error("❌ Error seeding Basic 3 R.M.E:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
