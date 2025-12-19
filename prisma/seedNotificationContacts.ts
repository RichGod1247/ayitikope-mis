// @ts-nocheck
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const contacts = [
    // 1–5: initial test contacts (ONLY these will receive messages at the start)
    { name: "Heh RichGod",    phone: "0242914353", isInitialTest: true },
    { name: "Heh Walter",     phone: "0242929100", isInitialTest: true },
    { name: "Heh WiseGod",    phone: "0533306113", isInitialTest: true },
    { name: "Heh Cornestina", phone: "0248028548", isInitialTest: true },
    { name: "Ekpe Winfred",   phone: "0248615820", isInitialTest: true },

    // 6–17: added later when you switch from initial -> full tests
    { name: "Madam Gertrude",      phone: "0535294702", isInitialTest: false },
    { name: "Sir Bright",          phone: "0557449066", isInitialTest: false },
    { name: "Sir Angellus",        phone: "0245444861", isInitialTest: false },
    { name: "Mr. Senu Peter",      phone: "0245923757", isInitialTest: false },
    { name: "Sir Alfred",          phone: "0530440867", isInitialTest: false },
    { name: "Mr. Attivor",         phone: "0244405837", isInitialTest: false },
    { name: "Madam Janet",         phone: "0243381907", isInitialTest: false },
    { name: "Sir Isaac Newton",    phone: "0551187485", isInitialTest: false },
    { name: "Sir RichLove",        phone: "0546072692", isInitialTest: false },
    { name: "Sir Stephen",         phone: "0540443314", isInitialTest: false },
    { name: "Madam Kuma Evelyn",   phone: "0542226652", isInitialTest: false },
    { name: "Madam Adonu Rejoice", phone: "0242560532", isInitialTest: false },
  ];

  for (const c of contacts) {
    await prisma.notificationContact.upsert({
      where: { phone: c.phone },
      update: {
        name: c.name,
        isInitialTest: c.isInitialTest,
        isActive: true,
      },
      create: {
        name: c.name,
        phone: c.phone,
        isInitialTest: c.isInitialTest,
        isActive: true,
      },
    });
  }

  console.log("Notification contacts seeded ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
