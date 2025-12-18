/* prisma/seed.cjs */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

// 🔹 NEW: use the detailed KG1 OWOP curriculum seeder
const { seedKg1Curriculum } = require("./seed-kg1-curriculum.cjs");

const prisma = new PrismaClient();

/**
 * Small helper so we don’t repeat the whole upsert shape
 * Used for Language & Literacy + Mathematics units
 */
async function upsertCurriculumUnit(unit) {
  const {
    id,
    tenantId = null,
    phase,
    level,
    subject,
    term,
    weekNumber,
    strandCode = null,
    strand,
    substrandCode = null,
    substrand,
    contentStandardCode = null,
    contentStandard,
    indicatorCode = null,
    indicator,
    notes = null,
  } = unit;

  await prisma.curriculumUnit.upsert({
    where: { id },
    create: {
      id,
      tenantId,
      phase,
      level,
      subject,
      term,
      weekNumber,
      strandCode,
      strand,
      substrandCode,
      substrand,
      contentStandardCode,
      contentStandard,
      indicatorCode,
      indicator,
      notes,
    },
    update: {
      tenantId,
      phase,
      level,
      subject,
      term,
      weekNumber,
      strandCode,
      strand,
      substrandCode,
      substrand,
      contentStandardCode,
      contentStandard,
      indicatorCode,
      indicator,
      notes,
    },
  });
}

/**
 * KG1 TERM 1 – LANGUAGE AND LITERACY
 * Subject name MUST stay exactly "Language and Literacy"
 */
async function seedKg1LanguageAndLiteracyTerm1() {
  const common = {
    phase: "KG",
    level: "KG1",
    subject: "Language and Literacy",
    term: "1st Term",
  };

  const units = [
    {
      id: "kg1-t1-ll-w1-oral-self-1",
      weekNumber: 1,
      strand: "All About Me",
      substrand: "Listening and speaking about self",
      contentStandard:
        "Learners listen and respond appropriately when talking about themselves, their names and body parts.",
      indicator:
        "Learners introduce themselves using simple sentences and mention at least three body parts correctly.",
      notes:
        "Circle-time oral language; teacher models, then learners practise in pairs and small groups.",
    },
    {
      id: "kg1-t1-ll-w2-oral-family-1",
      weekNumber: 2,
      strand: "All About Me",
      substrand: "Talking about family",
      contentStandard:
        "Learners use familiar vocabulary to talk about their family members and what they do.",
      indicator:
        "Learners name at least three family members and say something each person does at home.",
      notes:
        "Encourage use of home language where helpful, then bridge to English terms.",
    },
    {
      id: "kg1-t1-ll-w3-listening-stories-1",
      weekNumber: 3,
      strand: "All About Me",
      substrand: "Listening to and retelling short stories",
      contentStandard:
        "Learners listen attentively to short stories and retell parts of the story in their own words.",
      indicator:
        "After listening to a simple story about a child and their home, learners retell at least two key events with teacher support.",
      notes:
        "Use big books or teacher-made picture stories; emphasise key vocabulary.",
    },
    {
      id: "kg1-t1-ll-w4-rhyme-body-1",
      weekNumber: 4,
      strand: "Sounds and Rhymes",
      substrand: "Rhymes and songs about the body",
      contentStandard:
        "Learners enjoy and recite simple rhymes, songs and chants related to body parts and daily routines.",
      indicator:
        "Learners join in at least one action rhyme or song about body parts using appropriate actions.",
      notes:
        "Integrate with movement; focus on rhythm, repetition and fun rather than perfection.",
    },
    {
      id: "kg1-t1-ll-w5-pre-reading-1",
      weekNumber: 5,
      strand: "Reading Readiness",
      substrand: "Handling books and reading pictures",
      contentStandard:
        "Learners demonstrate interest in books and print by handling books correctly and talking about pictures.",
      indicator:
        "Learners hold a book the right way up, turn pages carefully and talk briefly about what they see in the pictures.",
      notes:
        "Use locally available story books and teacher-made picture charts.",
    },
    {
      id: "kg1-t1-ll-w6-phonological-1",
      weekNumber: 6,
      strand: "Sounds and Rhymes",
      substrand: "Hearing and playing with sounds in words",
      contentStandard:
        "Learners show awareness of sounds in spoken words through clapping, chanting and games.",
      indicator:
        "Learners clap or tap syllables in simple words (e.g. Ma-ma, bo-dy, ta-ble) with teacher guidance.",
      notes:
        "Keep this playful; no formal phonics yet, just sound awareness.",
    },
    {
      id: "kg1-t1-ll-w7-pre-writing-1",
      weekNumber: 7,
      strand: "Pre-writing Skills",
      substrand: "Developing fine motor control",
      contentStandard:
        "Learners develop fine motor skills needed for writing by tracing, colouring and drawing basic shapes.",
      indicator:
        "Learners trace and colour simple lines and shapes (straight, curved, circle, square) within guiding borders.",
      notes:
        "Use sand trays, air-writing, and large movements before fine paper-pencil work.",
    },
    {
      id: "kg1-t1-ll-w8-vocabulary-1",
      weekNumber: 8,
      strand: "Vocabulary Development",
      substrand: "Words about food and home",
      contentStandard:
        "Learners build vocabulary related to food, home and daily activities.",
      indicator:
        "Learners name at least four common foods and say whether they eat them at home or school.",
      notes:
        "Use real objects or pictures; link to OWOP food/nutrition discussions.",
    },
    {
      id: "kg1-t1-ll-w9-sentences-1",
      weekNumber: 9,
      strand: "Sentence Patterns",
      substrand: "Simple oral sentence patterns",
      contentStandard:
        "Learners use short, simple sentence patterns to talk about themselves and their environment.",
      indicator:
        "Learners respond to prompts such as “This is my …”, “I like …”, “I live in …” using simple oral sentences.",
      notes:
        "Teacher models pattern orally, learners echo and personalise responses.",
    },
    {
      id: "kg1-t1-ll-w10-review-1",
      weekNumber: 10,
      strand: "Revision and Consolidation",
      substrand: "Review of key oral and pre-reading skills",
      contentStandard:
        "Learners review key oral language, vocabulary and reading readiness skills learnt during the term.",
      indicator:
        "Learners participate in games, songs and short oral activities that combine self-introduction, family, food and environment vocabulary.",
      notes:
        "Focus on confidence and enjoyment; use mixed activities and mini-performances.",
    },
  ];

  for (const u of units) {
    await upsertCurriculumUnit({ ...common, ...u });
  }

  console.log(
    "Seeded KG1 Term 1 Language and Literacy curriculum units."
  );
}

/**
 * KG1 TERM 1 – MATHEMATICS (NUMERACY)
 * Subject name MUST be "Mathematics (Numeracy)" to match the UI.
 */
async function seedKg1MathematicsTerm1() {
  const common = {
    phase: "KG",
    level: "KG1",
    subject: "Mathematics (Numeracy)", // 🔴 changed from "Mathematics"
    term: "1st Term",
  };

  const units = [
    {
      id: "kg1-t1-math-w1-counting-objects-1",
      weekNumber: 1,
      strand: "Numbers",
      substrand: "Counting concrete objects 1–5",
      contentStandard:
        "Learners develop number sense by counting, matching and comparing sets of up to five objects.",
      indicator:
        "Learners correctly count and say numbers from 1 to 5 using real objects (e.g. bottle tops, stones, sticks).",
      notes:
        "Use plenty of concrete materials; link counting to everyday routines like sharing materials.",
    },
    {
      id: "kg1-t1-math-w2-counting-1-10-1",
      weekNumber: 2,
      strand: "Numbers",
      substrand: "Counting 1–10",
      contentStandard:
        "Learners extend counting skills to numbers 1–10 using songs, rhymes and games.",
      indicator:
        "Learners count forward from 1 to 10 and backward from 5 to 1 using number songs and counting games.",
      notes:
        "Integrate counting into movement activities; avoid rote without meaning.",
    },
    {
      id: "kg1-t1-math-w3-numerals-1-5-1",
      weekNumber: 3,
      strand: "Numbers",
      substrand: "Reading and writing numerals 1–5",
      contentStandard:
        "Learners recognise and trace numerals 1–5 and match them to quantities.",
      indicator:
        "Learners trace and match numerals 1–5 to sets of objects with the corresponding quantity.",
      notes:
        "Big numeral charts + sand/air writing before paper-pencil tracing.",
    },
    {
      id: "kg1-t1-math-w4-more-less-1-5-1",
      weekNumber: 4,
      strand: "Numbers",
      substrand: "Comparing quantities 1–5",
      contentStandard:
        "Learners compare small sets of objects and use words such as more, less and equal.",
      indicator:
        "Given two sets (1–5 objects), learners say which has more, which has less or whether they are equal using practical activities.",
      notes:
        "Keep language simple; use physical objects side by side for comparison.",
    },
    {
      id: "kg1-t1-math-w5-shapes-2d-1",
      weekNumber: 5,
      strand: "Geometry",
      substrand: "2D shapes in the environment",
      contentStandard:
        "Learners recognise basic plane shapes in their environment.",
      indicator:
        "Learners identify circles, triangles, squares and rectangles in classroom objects and simple picture cards.",
      notes:
        "Shape hunts around the classroom; encourage learners to touch and describe shapes.",
    },
    {
      id: "kg1-t1-math-w6-patterns-1",
      weekNumber: 6,
      strand: "Patterns and Relationships",
      substrand: "Simple repeating patterns",
      contentStandard:
        "Learners identify, copy and extend simple repeating patterns using shapes, colours or objects.",
      indicator:
        "Learners copy and extend AB, AAB or ABB patterns using counters, sticks or body movements (e.g. clap–tap).",
      notes:
        "Integrate music and movement; patterns can use sound, action or objects.",
    },
    {
      id: "kg1-t1-math-w7-measure-length-1",
      weekNumber: 7,
      strand: "Measurement",
      substrand: "Comparing length informally",
      contentStandard:
        "Learners compare the length of objects using everyday language.",
      indicator:
        "Learners compare two objects and say which is longer or shorter using direct comparison (side by side).",
      notes:
        "Use pencils, sticks, strings; emphasise vocabulary ‘longer than’, ‘shorter than’.",
    },
    {
      id: "kg1-t1-math-w8-measure-mass-1",
      weekNumber: 8,
      strand: "Measurement",
      substrand: "Comparing mass informally",
      contentStandard:
        "Learners compare the mass of objects using everyday language.",
      indicator:
        "Learners hold two objects and say which is heavier or lighter using balance activities with hands or simple balance devices.",
      notes:
        "Keep it practical and playful; no formal units of measurement yet.",
    },
    {
      id: "kg1-t1-math-w9-position-1",
      weekNumber: 9,
      strand: "Geometry and Space",
      substrand: "Position and direction words",
      contentStandard:
        "Learners use simple position and direction words in relation to themselves and objects.",
      indicator:
        "Learners use words such as in, on, under, in front of, behind to describe where objects are located.",
      notes:
        "Use classroom objects, chairs, and learners themselves as reference points.",
    },
    {
      id: "kg1-t1-math-w10-review-1",
      weekNumber: 10,
      strand: "Numbers and Shapes",
      substrand: "Revision of numbers 1–10 and key concepts",
      contentStandard:
        "Learners consolidate numbers 1–10 and key geometry/measurement ideas learnt during the term.",
      indicator:
        "Learners participate in mixed games and activities involving counting, numeral recognition, shapes, patterns and simple comparisons.",
      notes:
        "Use stations or centres with quick revision tasks; make it fun and low-pressure.",
    },
  ];

  for (const u of units) {
    await upsertCurriculumUnit({ ...common, ...u });
  }

  console.log(
    "Seeded KG1 Term 1 Mathematics (Numeracy) curriculum units."
  );
}

/**
 * MAIN SEED – core identity + KG1 curriculum units
 */
async function main() {
  // 1) Permissions
  const perms = [
    "view:announcement",
    "create:announcement",
    "edit:announcement",
    "delete:announcement",
    "manage:fees",
    "view:students",
    "edit:students",
    "view:teachers",
    "edit:teachers",
  ];
  for (const name of perms) {
    await prisma.permission.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }

  // 2) Tenants
  const t1 = await prisma.tenant.upsert({
    where: { slug: "ayitikope-basic" },
    create: {
      slug: "ayitikope-basic",
      name: "Ayitikope M/A Basic School",
    },
    update: {},
  });

  const t2 = await prisma.tenant.upsert({
    where: { slug: "sogakope-basic" },
    create: {
      slug: "sogakope-basic",
      name: "Sogakope M/A Basic School",
    },
    update: {},
  });

  // 3) Roles (tenant-scoped ADMIN for both tenants)
  const adminT1 = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: t1.id, name: "ADMIN" } },
    create: {
      tenantId: t1.id,
      name: "ADMIN",
      description: "Tenant administrator",
    },
    update: {},
  });

  const adminT2 = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: t2.id, name: "ADMIN" } },
    create: {
      tenantId: t2.id,
      name: "ADMIN",
      description: "Tenant administrator",
    },
    update: {},
  });

  // Attach all permissions to ADMIN in both tenants
  const allPerms = await prisma.permission.findMany();
  for (const p of allPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: adminT1.id, permissionId: p.id },
      },
      create: { roleId: adminT1.id, permissionId: p.id },
      update: {},
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: adminT2.id, permissionId: p.id },
      },
      create: { roleId: adminT2.id, permissionId: p.id },
      update: {},
    });
  }

  // 4) Admin user
  const email = "headteacher@ayitikope.school";
  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Head Teacher",
      passwordHash,
    },
    update: {},
  });

  // 5) Ensure memberships in BOTH tenants
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: t1.id } },
    create: {
      userId: user.id,
      tenantId: t1.id,
      roleId: adminT1.id,
      status: "ACTIVE",
    },
    update: { roleId: adminT1.id, status: "ACTIVE" },
  });

  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: t2.id } },
    create: {
      userId: user.id,
      tenantId: t2.id,
      roleId: adminT2.id,
      status: "ACTIVE",
    },
    update: { roleId: adminT2.id, status: "ACTIVE" },
  });

  // 6) Curriculum – KG1 Term 1 units for OWOP, Language & Literacy, Mathematics

  // 🔹 Detailed KG1 Term 1 Our World and Our People (from separate file)
  await seedKg1Curriculum(prisma);

  // 🔹 KG1 Term 1 Language and Literacy (this file)
  await seedKg1LanguageAndLiteracyTerm1();

  // 🔹 KG1 Term 1 Mathematics (Numeracy) (this file)
  await seedKg1MathematicsTerm1();

  console.log("Seed complete. Admin:", email, "Password: ChangeMe123!");
  console.log("Tenants:", [t1.slug, t2.slug]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
