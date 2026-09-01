"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message) {
  throw new Error(message);
}

function read(relativePath) {
  const full = path.join(repoRoot, relativePath);

  if (!fs.existsSync(full)) {
    fail(`Missing required file: ${relativePath}`);
  }

  return fs.readFileSync(full, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

const page = read("src/app/page.tsx");
const contact = read("src/app/contact/ContactPageClient.tsx");
const contactApi = read("src/app/api/contact/route.ts");
const contactSurface = `${contact}\n${contactApi}`;

assert(
  page.includes("useState(0)"),
  "Mobile evidence selection state missing."
);

assert(
  page.includes("aria-pressed={selected}"),
  "Mobile evidence selected state missing."
);

assert(
  page.includes("scale: 0.985"),
  "Restrained mobile touch feedback missing."
);

assert(
  page.includes("once: false"),
  "Bidirectional reveal motion missing."
);

assert(
  page.includes(
    "From classroom practice to institutional decisions, evidence stays connected to the person responsible for what happens next."
  ),
  "Value-based Product Proof copy missing."
);

assert(
  !page.includes("future-only promises"),
  "Old future-promise comparison language remains."
);

assert(
  !page.includes("touchAction"),
  "Native touch or pinch behavior must not be disabled."
);

[
  "Product Lead",
  "Institutional Partnerships Lead",
  "0242914353",
  "0547899418",
  "233242914353",
  "233547899418",
  "support@edulifeos.com",
  "Both contact points can support adoption and client success.",
].forEach((marker) => {
  assert(
    contactSurface.includes(marker),
    `Required contact marker missing: ${marker}`
  );
});

assert(
  !contactSurface.includes("Founder"),
  "Founder title must not be published."
);

[
  "Mr. Senu Peter",
  "Mr. Angellus Anyigba Atsu",
  "Mrs. Magbele Janet",
  "0508021572",
  "0245444861",
  "0243381907",
].forEach((marker) => {
  assert(
    !contactSurface.includes(marker),
    `Legacy active contact remains: ${marker}`
  );
});

assert(
  (contactApi.match(/wa:\s*"233/g) || []).length === 2,
  "Contact API must queue exactly two role-based WhatsApp recipients."
);

assert(
  contact.includes("Governance Officer"),
  "Contact relation list must include governance officers."
);

assert(
  contact.includes("Parent / Guardian"),
  "Contact relation list must include parents and guardians."
);

console.log("UI-LANDING-P1F1-R1 QA GREEN");
console.log("- partial landing refinement preserved");
console.log("- compact mobile evidence interaction present");
console.log("- bidirectional luxury reveal present");
console.log("- value-based Product Proof copy present");
console.log("- Product Lead without founder title");
console.log("- Institutional Partnerships Lead");
console.log("- shared support email");
console.log("- exactly two current WhatsApp recipients");
console.log("- legacy Ayitikope leadership contacts removed from active contact surface");