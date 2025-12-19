// prisma/seed/kg2-creative-arts.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ExemplarJson = {
  orderIndex: number;
  description: string;
};

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
  description: string;
  orderIndex: number;
  contentStandards?: ContentStandardJson[];
};

type StrandJson = {
  code: string;
  title: string;
  description: string;
  orderIndex: number;
  subStrands?: SubStrandJson[];
};

type CurriculumJson = {
  phase: string;
  level: string;
  subject: string;
  name: string;
  slug: string;
  orderIndex: number;
  description: string;
  strands: StrandJson[];
};

// ==============================
// 1. KG2 Creative Arts data
// ==============================

const curriculumData: CurriculumJson = {
  phase: 'KG',
  level: 'KG2',
  subject: 'Creative Arts',
  name: 'KG2 Creative Arts',
  slug: 'kg2-creative-arts',
  orderIndex: 1,
  description:
    'The KG2 Creative Arts curriculum builds on KG1, allowing learners to further explore, express, and understand arts through media, methods, techniques, and technology. It emphasizes creative expression, aesthetic perception, design principles, and the appreciation of historical and cultural contexts.',
  strands: [
    {
      code: 'CA1',
      title: 'MEDIA, METHODS, TECHNIQUES AND TECHNOLOGY',
      description:
        'Advanced exploration and experimentation with tools and materials to communicate ideas.',
      orderIndex: 1,
      subStrands: [
        {
          code: 'CA1.1',
          title:
            'Explore, understand and experiment creatively with variety of tools and materials',
          description: 'Using tools and materials to create and communicate.',
          orderIndex: 1,
          contentStandards: [
            {
              code: 'CA1.1.1',
              description:
                'Explore, understand and experiment creatively with variety of tools and materials',
              orderIndex: 1,
              indicators: [
                {
                  code: 'CA1.1.1.1',
                  description:
                    'Explore with simple tools and materials to create and communicate ideas',
                  orderIndex: 1,
                  exemplars: [
                    {
                      orderIndex: 1,
                      description:
                        'Learners use clay to mould objects e.g. farm tool and paint once it is dry and discuss their art works using positive language.',
                    },
                    {
                      orderIndex: 2,
                      description:
                        'Provide learners with different materials such as straws and old calendars to cut and create beads. Cut old calendars, brown papers, and roll them using glues.',
                    },
                    {
                      orderIndex: 3,
                      description:
                        'In small groups, the learners use glue and pieces of materials in the colours of the national flag to build a large collage of the Ghana Flag.',
                    },
                    {
                      orderIndex: 4,
                      description:
                        'Prepare and fly kites and other paper aeroplanes outside the classroom. Each in pairs, the learners use the paper and other tools to make kites and paper aeroplanes and other objects to play with.',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      code: 'CA2',
      title: 'CREATIVE EXPRESSION THROUGH PRODUCTION AND MAKING',
      description:
        'Expressing complex ideas and feelings through visual and performing arts.',
      orderIndex: 2,
      subStrands: [
        {
          code: 'CA2.1',
          title:
            'Design, make, exhibit, and respond to own or others art works (2-dimensional and 3-dimensional) freely',
          description: 'Creating and reflecting on art works, music, and drama.',
          orderIndex: 1,
          contentStandards: [
            {
              code: 'CA2.1.1',
              description:
                'Design, make, exhibit, and respond to own or others art works (2-dimensional and 3-dimensional) freely',
              orderIndex: 1,
              indicators: [
                {
                  code: 'CA2.1.1.1',
                  description:
                    'Express ideas by using shapes and art materials to make two and three-dimensional artworks',
                  orderIndex: 1,
                  exemplars: [
                    {
                      orderIndex: 1,
                      description:
                        'Have learners draw any of the natural sources of light they like and talk about their art work.',
                    },
                    {
                      orderIndex: 2,
                      description:
                        'Learners draw themselves and label the parts of the body in a drawing book. Write a simple sentence about yourself using invented writing.',
                    },
                    {
                      orderIndex: 3,
                      description:
                        'Learners design a family tree with cutting and pasting of pictures of family members on a drawing paper and write the initial letter and names of family members.',
                    },
                    {
                      orderIndex: 4,
                      description:
                        'Learners make a picture of any of the sources of water using the conversational poster as a guide. Have learners talk about their own drawing and that of others using positive language.',
                    },
                  ],
                },
                {
                  code: 'CA2.1.1.2',
                  description:
                    'Talk about how others art work, music or drama were made',
                  orderIndex: 2,
                  exemplars: [
                    {
                      orderIndex: 1,
                      description:
                        'Talk about how others make their art work to project good manners in the society. Show different greeting cards to learners and explain the different ways we use the cards.',
                    },
                    {
                      orderIndex: 2,
                      description:
                        'Display a variety of pictures and other art work of natural and man-made lights, learners observe them and describe the way they are created.',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      code: 'CA3',
      title: 'AESTHETIC PERCEPTION',
      description:
        'Deriving meaning and making detailed judgments about artworks based on beauty and senses.',
      orderIndex: 3,
      subStrands: [
        {
          code: 'CA3.1',
          title:
            'Derive meaning and make judgment about artworks using the senses according to its beauty.',
          description:
            'Observing and appreciating patterns and ideas in art.',
          orderIndex: 1,
          contentStandards: [
            {
              code: 'CA3.1.1',
              description:
                'Derive meaning and make judgment about artworks using the senses according to its beauty.',
              orderIndex: 1,
              indicators: [
                {
                  code: 'CA3.1.1.1',
                  description:
                    'Recognize and talk about simple patterns and art works found in the environment',
                  orderIndex: 1,
                  exemplars: [
                    {
                      orderIndex: 1,
                      description:
                        'Using pictures/conversational poster, guide learners to observe some art work on the experiments of presence of air and uses of air in the community and talk about them.',
                    },
                    {
                      orderIndex: 2,
                      description:
                        'Using conversational poster/pictures, have learners talk about uses of plants e.g. for shade, food, medicine, etc.',
                    },
                  ],
                },
                {
                  code: 'CA3.1.1.2',
                  description:
                    'Talk about the ideas expressed in own and others art works',
                  orderIndex: 2,
                  exemplars: [
                    {
                      orderIndex: 1,
                      description:
                        'Have learners classify and count the living and non-living things read about. This can be done according to the pictures on the pages of the book.',
                    },
                    {
                      orderIndex: 2,
                      description:
                        'Have learners draw their version of one living thing and one non-living thing they saw in the book and talk about their drawings.',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      code: 'CA4',
      title: 'ELEMENTS AND PRINCIPLES OF DESIGN',
      description:
        'Understanding and applying elements like colour, size, and shape in complex ways.',
      orderIndex: 4,
      subStrands: [
        {
          code: 'CA4.1',
          title:
            'Create and organize the elements of design according to the principles to create art forms',
          description:
            'Using design elements in art creation and analysis.',
          orderIndex: 1,
          contentStandards: [
            {
              code: 'CA4.1.1',
              description:
                'Create and organize the elements of design according to the principles to create art forms',
              orderIndex: 1,
              indicators: [
                {
                  code: 'CA4.1.1.1',
                  description:
                    'Identify and describe the elements of art in the environment and in works of art, emphasizing on their organization',
                  orderIndex: 1,
                  exemplars: [
                    {
                      orderIndex: 1,
                      description:
                        'Guide learners to use the colour names (red, yellow, green, white, black, etc.) to describe given items/objects on the poster e.g. trees, walls of buildings, dresses, etc.',
                    },
                    {
                      orderIndex: 2,
                      description:
                        'Using cut out papers and/or cards assist learners to recognise and describe a simple repeating non-numerical pattern of sound, shapes, colours, etc. (e.g. repetition of 2,3, 2 pattern).',
                    },
                    {
                      orderIndex: 3,
                      description:
                        'Identify and describe the elements of art in the environment and create their own artwork. Display a variety of pictures and other art work of natural and man-made lights.',
                    },
                  ],
                },
                {
                  code: 'CA4.1.1.2',
                  description:
                    'Make art works with the elements and principles of art',
                  orderIndex: 2,
                  exemplars: [
                    {
                      orderIndex: 1,
                      description:
                        'Have learners create simple patterns using colour or size. Extend this activity to include sounds and movement patterns.',
                    },
                    {
                      orderIndex: 2,
                      description:
                        'Learners draw their favourite part and colour it nicely, after which they turn and talk to another child sitting next to them why they like that part.',
                    },
                    {
                      orderIndex: 3,
                      description:
                        'Draw and colour an object that can hurt, harm, have a sharp edge, etc. and legibly write/scribe the name under it.',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      code: 'CA5',
      title: 'HISTORICAL AND CULTURAL CONTEXT',
      description:
        'Connecting arts to history, culture, and society with deeper understanding.',
      orderIndex: 5,
      subStrands: [
        {
          code: 'CA5.1',
          title:
            'Demonstrate knowledge and skills of the visual and performing arts in relation to history, culture, environment and modern society',
          description:
            'Appreciating and performing art in cultural and historical contexts.',
          orderIndex: 1,
          contentStandards: [
            {
              code: 'CA5.1.1',
              description:
                'Demonstrate knowledge and skills of the visual and performing arts in relation to history, culture, environment and modern society',
              orderIndex: 1,
              indicators: [
                {
                  code: 'CA5.1.1.1',
                  description:
                    'Observe, identify and talk about images, items and performances in artworks of everyday life',
                  orderIndex: 1,
                  exemplars: [
                    {
                      orderIndex: 1,
                      description:
                        'Using the pictures of the weather, let learners talk about the beauty of each of them. Assist them use the weather vocabulary to make simple sentences.',
                    },
                    {
                      orderIndex: 2,
                      description:
                        'Identify, observe and talk about art in the immediate natural and manmade environment. Using a conversational poster of the sources of light depicting day and night, guide learners to identify the natural and artificial sources.',
                    },
                  ],
                },
                {
                  code: 'CA5.1.1.2',
                  description:
                    'Create art works inspired by places in our culture and country',
                  orderIndex: 2,
                  exemplars: [
                    {
                      orderIndex: 1,
                      description:
                        'Using a picture, have learners talk about elements in the palace which interests them. Guide them to make a picture of the umbrella and label it nicely.',
                    },
                    {
                      orderIndex: 2,
                      description:
                        'Learners study the flags of other countries and design different maps for the classroom. The classroom should be set up as an international classroom.',
                    },
                  ],
                },
                {
                  code: 'CA5.1.1.3',
                  description:
                    'Create and perform dance movements and music inspired by Ghanaian history and other cultures',
                  orderIndex: 3,
                  exemplars: [
                    {
                      orderIndex: 1,
                      description:
                        'Learners listen to a music on Ghanaian history and dance to it (e.g. Hɛn ara asaase ni). Teach the keywords and discuss the lyrics of the song with the learners.',
                    },
                    {
                      orderIndex: 2,
                      description:
                        'Learners use improvised musical instrument to play their own music, accompanied by dance movements.',
                    },
                    {
                      orderIndex: 3,
                      description:
                        'Learners should organize a Kiddies march past. Let them sing some patriotic songs and match on it while others play instruments.',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// ==============================
// 2. Helper: deterministic IDs
// ==============================

function makeId(...parts: string[]): string {
  return parts.join('::');
}

// ==============================
// 3. Seeding logic
// ==============================

async function seedCurriculum(data: CurriculumJson) {
  console.log(`📚 Seeding curriculum for: ${data.name}`);

  // ---- SUBJECT: find by slug, reuse ID if exists ----
  const existing = await prisma.curriculumSubject.findUnique({
    where: { slug: data.slug },
  });

  let subjectId: string;

  if (existing) {
    subjectId = existing.id;
    console.log(
      `🎯 Found existing subject with slug=${data.slug} (id=${subjectId}), updating...`
    );
    await prisma.curriculumSubject.update({
      where: { id: subjectId },
      data: {
        phase: data.phase,
        level: data.level,
        name: data.name,
        slug: data.slug,
        description: data.description,
        orderIndex: data.orderIndex,
      },
    });
  } else {
    subjectId = makeId(data.phase, data.level, data.slug);
    console.log(
      `🆕 No subject with slug=${data.slug} found. Creating new subject with id=${subjectId}...`
    );
    await prisma.curriculumSubject.create({
      data: {
        id: subjectId,
        phase: data.phase,
        level: data.level,
        name: data.name,
        slug: data.slug,
        description: data.description,
        orderIndex: data.orderIndex,
      },
    });
  }

  // ------ Strands ------
  for (const strand of data.strands ?? []) {
    const strandId = makeId(subjectId, strand.code);

    await prisma.curriculumStrand.upsert({
      where: { id: strandId },
      create: {
        id: strandId,
        subjectId,
        code: strand.code,
        title: strand.title,
        description: strand.description,
        orderIndex: strand.orderIndex,
      },
      update: {
        code: strand.code,
        title: strand.title,
        description: strand.description,
        orderIndex: strand.orderIndex,
      },
    });

    // ------ Sub-strands ------
    for (const sub of strand.subStrands ?? []) {
      const subId = makeId(strandId, sub.code);

      await prisma.curriculumSubStrand.upsert({
        where: { id: subId },
        create: {
          id: subId,
          strandId,
          code: sub.code,
          title: sub.title,
          description: sub.description,
          orderIndex: sub.orderIndex,
        },
        update: {
          code: sub.code,
          title: sub.title,
          description: sub.description,
          orderIndex: sub.orderIndex,
        },
      });

      // ------ Content Standards ------
      for (const cs of sub.contentStandards ?? []) {
        const csId = makeId(subId, cs.code);

        await prisma.curriculumContentStandard.upsert({
          where: { id: csId },
          create: {
            id: csId,
            subStrandId: subId,
            code: cs.code,
            description: cs.description,
            orderIndex: cs.orderIndex,
          },
          update: {
            code: cs.code,
            description: cs.description,
            orderIndex: cs.orderIndex,
          },
        });

        // ------ Indicators ------
        for (const ind of cs.indicators ?? []) {
          const indId = makeId(csId, ind.code);

          await prisma.curriculumIndicator.upsert({
            where: { id: indId },
            create: {
              id: indId,
              contentStandardId: csId,
              code: ind.code,
              description: ind.description,
              orderIndex: ind.orderIndex,
            },
            update: {
              code: ind.code,
              description: ind.description,
              orderIndex: ind.orderIndex,
            },
          });

          // ------ Exemplars ------
          for (const ex of ind.exemplars ?? []) {
            const exId = makeId(indId, String(ex.orderIndex));

            await prisma.curriculumExemplar.upsert({
              where: { id: exId },
              create: {
                id: exId,
                indicatorId: indId,
                title: null,
                description: ex.description,
                assessmentNotes: null,
                orderIndex: ex.orderIndex,
              },
              update: {
                description: ex.description,
                orderIndex: ex.orderIndex,
              },
            });
          }
        }
      }
    }
  }

  console.log(`✅ Done seeding: ${data.name}`);
}

async function main() {
  await seedCurriculum(curriculumData);
}

main()
  .catch((err) => {
    console.error('❌ Error seeding KG2 Creative Arts', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
