// prisma/seed-kg1-curriculum.cjs

/**
 * KG1 • Term 1 • Our World and Our People (OWOP)
 *
 * These are NATIONAL master units (tenantId left null).
 * They are what the lesson-note studio & AI Co-Tutor will read.
 *
 * Very important:
 *   subject = "Our World and Our People"
 * must match what the Teacher Lesson Note UI uses.
 */

/**
 * This array is your detailed KG1 Term 1 OWOP curriculum.
 * Each object is one CurriculumUnit row in the database.
 */
const kg1OwopTerm1 = [
  // WEEK 1 — K1.1.1 I am a wonderful and unique creature
  {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People", // canonical subject name
    term: "1st Term",
    weekNumber: 1,

    strandCode: "K1.1",
    strand: "All about me",
    substrandCode: "K1.1.1",
    substrand: "I am a wonderful and unique creature",

    contentStandardCode: "K1.1.1.1",
    contentStandard:
      "Learners show that they are wonderful and unique persons with body features that make them similar to and different from others and other creations in the environment.",

    indicatorCode: "K1.1.1.1.1–K1.1.1.1.7",
    indicator:
      "Talk about body features; identify and name visible body parts; describe themselves using positive words; explore parts of a book; sing and act action songs about the body; draw themselves and scribble under; make and count sets of body parts up to 5.",

    notes:
      "Use big books with pictures of children, posters of body parts and simple counters. Integrate Language & Literacy (picture reading, key vocabulary like head, eyes, nose, mouth), Numeracy (forming and counting sets of body parts) and Creative Arts (drawing and colouring themselves). Songs such as simple action songs about body parts help learners appreciate that they are special and unique.",
  },

  // WEEK 2 — K1.1.2 The parts of the human body and their functions
  {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People",
    term: "1st Term",
    weekNumber: 2,

    strandCode: "K1.1",
    strand: "All about me",
    substrandCode: "K1.1.2",
    substrand: "The parts of the human body and their functions",

    contentStandardCode: "K1.1.2.1",
    contentStandard:
      "Learners demonstrate understanding of the names of main external body parts and what they are used for (seeing, hearing, walking, holding, etc.).",

    indicatorCode: "K1.1.2.1.1–K1.1.2.1.7",
    indicator:
      "Name and point to different parts of the body; say what each part can do; dramatise functions with simple actions; sing action songs about body parts; act and count functions of selected parts; compare and match pictures of body parts to their functions; compare simple shapes of body parts and match them with numerals.",

    notes:
      "Key experiences: learners act out what eyes, ears, mouth, hands and legs can do, and describe actions in simple language. They sing action songs and clap to the rhythm while counting how many different body parts are mentioned. Connect basic geometry (head like a circle, arms like lines) to Numeracy.",
  },

  // WEEK 3 — K1.1.3 Caring for the parts of my body
  {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People",
    term: "1st Term",
    weekNumber: 3,

    strandCode: "K1.1",
    strand: "All about me",
    substrandCode: "K1.1.3",
    substrand: "Caring for the parts of my body",

    contentStandardCode: "K1.1.3.1",
    contentStandard:
      "Learners show understanding of why personal hygiene is important and how to care for body parts such as hands, feet, face, teeth and fingernails.",

    indicatorCode: "K1.1.3.1.1–K1.1.3.1.8",
    indicator:
      "Sing and recite rhymes about caring for the body; demonstrate ways of washing, brushing and keeping nails short; watch short clips or picture stories about hygiene; talk about materials used for cleaning the body; listen to a read-aloud from a big book on hygiene; count and classify cleaning materials (soap, sponge, toothbrush, etc.); talk about colours, shapes and simple numbers related to hygiene materials.",

    notes:
      'Use songs like "This is the way I wash my face" and let learners act each line as they sing. Use pictures or a short video to show cleaning routines, then let children identify and count items used. Link to Literacy through key vocabulary (wash, soap, towel, brush, teeth, nails) and to Numeracy by counting and grouping cleaning materials by type or colour.',
  },

  // WEEKS 4 & 5 — K1.1.4 Keeping my body healthy by eating good food and taking my vaccination
  {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People",
    term: "1st Term",
    weekNumber: 4,

    strandCode: "K1.1",
    strand: "All about me",
    substrandCode: "K1.1.4",
    substrand:
      "Keeping my body healthy by eating good food and taking my vaccination",

    contentStandardCode: "K1.1.4.1",
    contentStandard:
      "Learners show understanding that eating healthy food and taking vaccinations help them to grow well and stay strong and free from common childhood diseases.",

    indicatorCode: "K1.1.4.1.1–K1.1.4.1.8",
    indicator:
      "Identify and name different food items; group food pictures into simple food groups; talk about why certain foods help them grow and stay strong; listen to stories or read-alouds on healthy eating; talk about going to clinic for injections and vaccination; role-play visiting the clinic; draw and colour favourite healthy foods; count and match food pictures in sets.",

    notes:
      "Picture reading of healthy foods; sorting pictures of fruits, vegetables, grains and animal products; simple talk about breakfast, lunch and supper; link food to body strength. Introduce clinic/vaccination gently: nurses, injections that prevent sickness. Numeracy: counting food items in sets and matching them to numerals.",
  },
  {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People",
    term: "1st Term",
    weekNumber: 5,

    strandCode: "K1.1",
    strand: "All about me",
    substrandCode: "K1.1.4",
    substrand:
      "Keeping my body healthy by eating good food and taking my vaccination",

    contentStandardCode: "K1.1.4.1",
    contentStandard:
      "Learners continue to explore how good food and vaccination keep them healthy, using more varied texts, songs and sorting/counting activities.",

    indicatorCode: "K1.1.4.1.1–K1.1.4.1.8",
    indicator:
      "Revisit naming and grouping food items; create simple songs or rhymes about healthy eating; use picture stories about a child who eats well and visits the clinic; match pictures of food to simple sentences; count sets of food items; do simple comparisons (more/less) of different food groups.",

    notes:
      "Deepens Week 4 experiences. Learners talk about favourite healthy meals, compare lunches in school, and act short role-plays about going to the clinic. Numeracy: comparing quantities of different food groups and making simple pictographs with counters or bottle tops.",
  },

  // WEEK 6 — K1.1.5 My environment and my health
  {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People",
    term: "1st Term",
    weekNumber: 6,

    strandCode: "K1.1",
    strand: "All about me",
    substrandCode: "K1.1.5",
    substrand: "My environment and my health",

    contentStandardCode: "K1.1.5.1",
    contentStandard:
      "Learners demonstrate understanding that a clean environment helps them stay healthy and a dirty environment can cause sickness.",

    indicatorCode: "K1.1.5.1.1–K1.1.5.1.8",
    indicator:
      "Talk about clean and dirty places around them; identify objects used for cleaning; demonstrate how to sweep, pick litter and dispose of waste properly; listen to a story about cleanliness; draw and colour clean environments; sort pictures into clean/unclean; count and group cleaning tools.",

    notes:
      "Use posters showing clean and dirty surroundings. Discuss keeping classroom and compound clean. Short supervised walk to identify where rubbish collects and how to dispose of it. Numeracy: counting cleaning tools and grouping them; Literacy: vocabulary like broom, bin, dustpan, rubbish, clean, dirty.",
  },

  // WEEKS 7 & 8 — K1.1.6 Protecting ourselves from home and road accidents
  {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People",
    term: "1st Term",
    weekNumber: 7,

    strandCode: "K1.1",
    strand: "All about me",
    substrandCode: "K1.1.6",
    substrand: "Protecting ourselves from home and road accidents",

    contentStandardCode: "K1.1.6.1",
    contentStandard:
      "Learners show awareness of common dangers at home and on the road and ways to keep themselves safe.",

    indicatorCode: "K1.1.6.1.1–K1.1.6.1.7",
    indicator:
      "Identify possible dangers at home and school (fire, sharp objects, slippery floors); talk about safe behaviour near the road; recognise some road symbols and colours; role-play safe crossing of the road; listen to and retell stories about safety; draw and colour simple safety scenes; count and match pictures of safe/unsafe actions.",

    notes:
      "Use posters showing home and road accidents and how to prevent them. Practise safety language such as stop, look, listen and think. Learners act out safe behaviours. Numeracy: counting examples of safe actions; Literacy: safety vocabulary and oral retelling of safety stories.",
  },
  {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People",
    term: "1st Term",
    weekNumber: 8,

    strandCode: "K1.1",
    strand: "All about me",
    substrandCode: "K1.1.6",
    substrand: "Protecting ourselves from home and road accidents",

    contentStandardCode: "K1.1.6.1",
    contentStandard:
      "Learners consolidate understanding of safety rules at home and on the road through stories, role-play and games.",

    indicatorCode: "K1.1.6.1.1–K1.1.6.1.7",
    indicator:
      "Revisit pictures of dangerous and safe situations; sort actions into safe/not safe; develop class rules about safety; create simple songs or chants about crossing the road; sequence picture stories showing correct safety steps.",

    notes:
      "Deepens safety experiences from Week 7. Learners help create a simple ‘safety charter’ for classroom and playground. Use simple sequencing activities (first… then… last) to support both literacy and safety understanding.",
  },

  // WEEK 9 — K1.2.1 Types and members of my family
  {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People",
    term: "1st Term",
    weekNumber: 9,

    strandCode: "K1.2",
    strand: "My family",
    substrandCode: "K1.2.1",
    substrand: "Types and members of my family",

    contentStandardCode: "K1.2.1.1",
    contentStandard:
      "Learners show understanding of the different types of family around them and can identify people who belong to their own families.",

    indicatorCode: "K1.2.1.1.1–K1.2.1.1.7",
    indicator:
      "Talk about who lives with them at home; identify and name family members (mother, father, siblings, grandparents, carers); differentiate between small and large families; match pictures of family members with kinship terms; talk about activities they do with family; sing songs about families; draw and colour their own families.",

    notes:
      "Use posters and pictures of different family types. Literacy: kinship vocabulary and simple oral sentences about family members. Numeracy: counting members in their family and comparing ‘more’ or ‘less’. Creative Arts: drawing and labelling family portraits.",
  },

  // WEEK 10 — K1.2.2 Origin and history of my family
  {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People",
    term: "1st Term",
    weekNumber: 10,

    strandCode: "K1.2",
    strand: "My family",
    substrandCode: "K1.2.2",
    substrand: "Origin and history of my family",

    contentStandardCode: "K1.2.2.1",
    contentStandard:
      "Learners become aware that families come from different places and can share simple stories about where they or their caregivers come from.",

    indicatorCode: "K1.2.2.1.1–K1.2.2.1.7",
    indicator:
      "Listen to simple stories about people from different parts of Ghana; talk about where their parents or caregivers come from; look at a simple map of Ghana and notice that people live in many places; compare pictures of people from different ethnic backgrounds; sing songs from different local languages; draw themselves with elements that show where they come from (dress, food, etc.).",

    notes:
      "Use pictures or posters of people from different parts of Ghana and, if possible, a simple map. Allow children to share where their parents or guardians come from. This builds identity and respect for diversity.",
  },

  // WEEK 11 — K1.2.3 Family celebrations and festivals
  {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People",
    term: "1st Term",
    weekNumber: 11,

    strandCode: "K1.2",
    strand: "My family",
    substrandCode: "K1.2.3",
    substrand: "Family celebrations and festivals",

    contentStandardCode: "K1.2.3.1",
    contentStandard:
      "Learners show understanding that families celebrate important events and festivals together and that these events are joyful times for sharing and belonging.",

    indicatorCode: "K1.2.3.1.1–K1.2.3.1.7",
    indicator:
      "Talk about celebrations they have experienced (birthdays, naming ceremonies, religious and traditional festivals); describe what people wear and do at these celebrations; sing and dance to songs associated with celebrations; role-play a simple family celebration; draw and colour scenes of celebrations.",

    notes:
      "Use posters or pictures of common Ghanaian celebrations and festivals. Allow children to share their own experiences of birthdays, Christmas, Eid, and local festivals.",
  },

  // WEEK 12 — K1.2.4 My school family
  {
    phase: "KG",
    level: "KG1",
    subject: "Our World and Our People",
    term: "1st Term",
    weekNumber: 12,

    strandCode: "K1.2",
    strand: "My family",
    substrandCode: "K1.2.4",
    substrand: "My school family",

    contentStandardCode: "K1.2.4.1",
    contentStandard:
      "Learners recognise that the school is also a family made up of different people who care for them and help them learn.",

    indicatorCode: "K1.2.4.1.1–K1.2.4.1.7",
    indicator:
      "Identify different people in the school (headteacher, teachers, pupils, non-teaching staff); talk about what each does to help them; walk around the school environment and greet different school ‘family’ members; draw and label simple pictures of their school; share how they can help keep the school family happy and safe.",

    notes:
      "Use a guided ‘school tour’ to let learners see and name different people and places in the school. Build sense of belonging and responsibility (greeting, tidiness, obeying simple rules).",
  },
];

/**
 * Called from prisma/seed.cjs with the existing PrismaClient
 * @param {import("@prisma/client").PrismaClient} prisma
 */
async function seedKg1Curriculum(prisma) {
  await prisma.curriculumUnit.createMany({
    data: kg1OwopTerm1,
    skipDuplicates: true,
  });

  console.log(
    "Seeded detailed KG1 Term 1 Our World and Our People curriculum units."
  );
}

module.exports = { seedKg1Curriculum };
