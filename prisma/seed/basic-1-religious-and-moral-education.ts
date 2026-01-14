// prisma/seed/basic-1-religious-and-moral-education.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to curriculum JSON
const CURRICULUM_DIR = path.join(__dirname, "curriculum");
const FILE_NAME = "basic-1-religious-and-moral-education.json";

type ExemplarJson = { orderIndex: number; description: string };
type IndicatorJson = {
  code: string;
  description: string;
  orderIndex?: number;
  exemplars?: ExemplarJson[];
};
type ContentStandardJson = {
  code: string;
  description: string;
  orderIndex?: number;
  indicators?: IndicatorJson[];
};
type SubStrandJson = {
  code: string;
  title: string;
  description?: string;
  orderIndex?: number;
  contentStandards?: ContentStandardJson[];
};
type StrandJson = {
  code: string;
  title: string;
  description?: string;
  orderIndex?: number;
  subStrands?: SubStrandJson[];
};
type SubjectJson = {
  phase: string;
  level: string;
  subject?: string;
  name: string;
  slug: string;
  orderIndex?: number;
  description?: string;
  strands?: StrandJson[];
};

function ensureString(v: any, label: string) {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Missing/invalid ${label}`);
  return v.trim();
}

function normalizeRoot(json: any): SubjectJson[] {
  if (Array.isArray(json)) return json as SubjectJson[];
  if (json?.subjects && Array.isArray(json.subjects)) return json.subjects as SubjectJson[];
  return [json as SubjectJson];
}

async function main() {
  const fullPath = path.join(CURRICULUM_DIR, FILE_NAME);

  console.log("📦 Seeding Basic 1 Religious and Moral Education from JSON in:", CURRICULUM_DIR);

  if (!fs.existsSync(fullPath)) {
    console.error("❌ Basic 1 R.M.E JSON file not found:", fullPath);
    process.exit(1);
  }

  console.log("📖 Loading Basic 1 R.M.E from:", fullPath);

  const raw = fs.readFileSync(fullPath, "utf8");
  const parsed = JSON.parse(raw);
  const subjects = normalizeRoot(parsed);

  if (!subjects.length) {
    console.error("❌ No subject data found in JSON.");
    process.exit(1);
  }

  let created = 0;
  let updated = 0;

  let strandsCnt = 0;
  let subStrandsCnt = 0;
  let contentStandardsCnt = 0;
  let indicatorsCnt = 0;
  let exemplarsCnt = 0;

  for (const subj of subjects) {
    const slug = ensureString(subj.slug, "subject.slug");
    const name = ensureString(subj.name ?? subj.subject, "subject.name");
    const phase = ensureString(subj.phase, "subject.phase");
    const level = ensureString(subj.level, "subject.level");
    const description = typeof subj.description === "string" ? subj.description : null;
    const orderIndex = typeof subj.orderIndex === "number" ? subj.orderIndex : 1;

    // Subject upsert (slug should be unique)
    const existingSubject = await prisma.curriculumSubject.findUnique({ where: { slug } });
    const subject =
      existingSubject
        ? await prisma.curriculumSubject.update({
            where: { slug },
            data: { name, phase, level, description, orderIndex },
          })
        : await prisma.curriculumSubject.create({
            data: { slug, name, phase, level, description, orderIndex },
          });

    if (existingSubject) updated++;
    else created++;

    console.log(`→ Subject: ${subject.name} (${subject.slug}) [${existingSubject ? "update" : "create"}]`);

    const strands = subj.strands ?? [];
    for (const st of strands) {
      const strandCode = ensureString(st.code, "strand.code");
      const strandTitle = ensureString(st.title, `strand(${strandCode}).title`);
      const strandDesc = typeof st.description === "string" ? st.description : null;
      const strandOrder = typeof st.orderIndex === "number" ? st.orderIndex : 1;

      // Strand: find by (subjectId + code)
      const existingStrand = await prisma.curriculumStrand.findFirst({
        where: { subjectId: subject.id, code: strandCode },
      });

      const strand = existingStrand
        ? await prisma.curriculumStrand.update({
            where: { id: existingStrand.id },
            data: { code: strandCode, title: strandTitle, description: strandDesc, orderIndex: strandOrder },
          })
        : await prisma.curriculumStrand.create({
            data: {
              subjectId: subject.id,
              code: strandCode,
              title: strandTitle,
              description: strandDesc,
              orderIndex: strandOrder,
            },
          });

      strandsCnt++;

      const subStrands = st.subStrands ?? [];
      for (const ss of subStrands) {
        const subStrandCode = ensureString(ss.code, "subStrand.code");
        const subStrandTitle = ensureString(ss.title, `subStrand(${subStrandCode}).title`);
        const subStrandDesc = typeof ss.description === "string" ? ss.description : null;
        const subStrandOrder = typeof ss.orderIndex === "number" ? ss.orderIndex : 1;

        const existingSubStrand = await prisma.curriculumSubStrand.findFirst({
          where: { strandId: strand.id, code: subStrandCode },
        });

        const subStrand = existingSubStrand
          ? await prisma.curriculumSubStrand.update({
              where: { id: existingSubStrand.id },
              data: {
                code: subStrandCode,
                title: subStrandTitle,
                description: subStrandDesc,
                orderIndex: subStrandOrder,
              },
            })
          : await prisma.curriculumSubStrand.create({
              data: {
                strandId: strand.id,
                code: subStrandCode,
                title: subStrandTitle,
                description: subStrandDesc,
                orderIndex: subStrandOrder,
              },
            });

        subStrandsCnt++;

        const contentStandards = ss.contentStandards ?? [];
        for (const cs of contentStandards) {
          const csCode = ensureString(cs.code, "contentStandard.code");
          const csDesc = ensureString(cs.description, `contentStandard(${csCode}).description`);
          const csOrder = typeof cs.orderIndex === "number" ? cs.orderIndex : 1;

          const existingCS = await prisma.curriculumContentStandard.findFirst({
            where: { subStrandId: subStrand.id, code: csCode },
          });

          const contentStandard = existingCS
            ? await prisma.curriculumContentStandard.update({
                where: { id: existingCS.id },
                data: { code: csCode, description: csDesc, orderIndex: csOrder },
              })
            : await prisma.curriculumContentStandard.create({
                data: { subStrandId: subStrand.id, code: csCode, description: csDesc, orderIndex: csOrder },
              });

          contentStandardsCnt++;

          const indicators = cs.indicators ?? [];
          for (const ind of indicators) {
            const indCode = ensureString(ind.code, "indicator.code");
            const indDesc = ensureString(ind.description, `indicator(${indCode}).description`);
            const indOrder = typeof ind.orderIndex === "number" ? ind.orderIndex : 1;

            const existingInd = await prisma.curriculumIndicator.findFirst({
              where: { contentStandardId: contentStandard.id, code: indCode },
            });

            const indicator = existingInd
              ? await prisma.curriculumIndicator.update({
                  where: { id: existingInd.id },
                  data: { code: indCode, description: indDesc, orderIndex: indOrder },
                })
              : await prisma.curriculumIndicator.create({
                  data: {
                    contentStandardId: contentStandard.id,
                    code: indCode,
                    description: indDesc,
                    orderIndex: indOrder,
                  },
                });

            indicatorsCnt++;

            const exemplars = ind.exemplars ?? [];
            for (const ex of exemplars) {
              const exOrder = typeof ex.orderIndex === "number" ? ex.orderIndex : 1;
              const exDesc = ensureString(ex.description, `exemplar(orderIndex=${exOrder}).description`);

              const existingEx = await prisma.curriculumExemplar.findFirst({
                where: { indicatorId: indicator.id, orderIndex: exOrder },
              });

              if (existingEx) {
                await prisma.curriculumExemplar.update({
                  where: { id: existingEx.id },
                  data: { description: exDesc, orderIndex: exOrder },
                });
              } else {
                await prisma.curriculumExemplar.create({
                  data: { indicatorId: indicator.id, orderIndex: exOrder, description: exDesc },
                });
              }

              exemplarsCnt++;
            }
          }
        }
      }
    }
  }

  console.log("🎉 Done seeding Basic 1 R.M.E curriculum.");
  console.log({
    subjectsCreated: created,
    subjectsUpdated: updated,
    strands: strandsCnt,
    subStrands: subStrandsCnt,
    contentStandards: contentStandardsCnt,
    indicators: indicatorsCnt,
    exemplars: exemplarsCnt,
  });
}

main()
  .catch((e) => {
    console.error("❌ basic-1-rme seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
