import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Recreate __filename and __dirname in ESM/ts-node environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadJson(relPath: string) {
  const fullPath = path.join(__dirname, relPath);
  const raw = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(raw);
}

function main() {
  const part1 = loadJson("curriculum/basic-1-english-language-part-1.json");
  const part2 = loadJson("curriculum/basic-1-english-language-part-2.json");
  const part3 = loadJson("curriculum/basic-1-english-language-part-3.json");
  const part4 = loadJson("curriculum/basic-1-english-language-part-4.json");

  // Parts 2–4 wrap the subject in `subjects[0]`
  const subject2 = part2.subjects[0];
  const subject3 = part3.subjects[0];
  const subject4 = part4.subjects[0];

  // Use Part 1 as the base (it already has the top-level subject shape)
  const base = {
    phase: part1.phase,
    level: part1.level,
    subject: part1.subject,
    name: part1.name,
    slug: part1.slug,
    orderIndex: part1.orderIndex,
    description: part1.description,
  };

  // Start with strands from Part 1 + Part 2 + Part 3
  let strands: any[] = [
    ...(part1.strands || []),
    ...(subject2.strands || []),
    ...(subject3.strands || []),
  ];

  // Part 4 has B1.5 (extra grammar sub-strands) and B1.6 (Extensive Reading)
  const strands4 = subject4.strands || [];
  const b15FromPart4 = strands4.find((s: any) => s.code === "B1.5");
  const otherFromPart4 = strands4.filter((s: any) => s.code !== "B1.5");

  if (b15FromPart4) {
    const existingB15 = strands.find((s: any) => s.code === "B1.5");
    if (existingB15) {
      // Merge subStrands under B1.5
      existingB15.subStrands = [
        ...(existingB15.subStrands || []),
        ...(b15FromPart4.subStrands || []),
      ];
    } else {
      strands.push(b15FromPart4);
    }
  }

  // Add B1.6 etc.
  strands = [...strands, ...otherFromPart4];

  const merged = {
    ...base,
    strands,
  };

  const outPath = path.join(
    __dirname,
    "curriculum",
    "basic-1-english-language.json"
  );

  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), "utf8");

  console.log("✅ Merged Basic 1 English →", outPath);
  console.log("   Total strands:", merged.strands.length);
}

main();
