#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository TypeScript source for focused contract/runtime verification. */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/\r\n?/g, "\n");
}

function has(source, marker, label) {
  assert(
    source.includes(marker),
    `${label} missing: ${JSON.stringify(marker)}`,
  );
}

function count(source, marker) {
  return source.split(marker).length - 1;
}

const registry = read("src/lib/ghanaianLanguages/registry.ts");
const text = read("src/lib/ghanaianLanguages/text.ts");
const palette = read("src/components/teacher/GhanaianLanguageCharacterPalette.tsx");
const editor = read("src/app/teacher/lesson-notes/[id]/ui/LessonNoteEditorClient.tsx");

has(registry, "export type GhanaianLanguageInputMark", "registry input-mark type");
has(registry, "inputMarks?: readonly GhanaianLanguageInputMark[];", "optional per-language input-mark contract");
has(registry, "replacementGroup: string;", "language-owned replacement-group contract");

assert.strictEqual(
  count(registry, "    inputMarks: ["),
  1,
  "Only one language definition should register input marks at this milestone.",
);

const eweStart = registry.indexOf('    code: "EWE",');
assert(eweStart >= 0, "EWE definition missing.");
const nextLanguageStart = registry.indexOf("\n  {\n    code:", eweStart + 1);
const eweEnd =
  nextLanguageStart >= 0
    ? nextLanguageStart
    : registry.indexOf("\n] as const;", eweStart);
assert(eweEnd > eweStart, "EWE definition boundary missing.");
const ewe = registry.slice(eweStart, eweEnd);

for (const marker of [
  'id: "nasal"',
  'label: "Nasal"',
  'display: "\\u25CC\\u0303"',
  'value: "\\u0303"',
  'id: "high-tone"',
  'label: "High tone"',
  'display: "\\u25CC\\u0301"',
  'value: "\\u0301"',
  'id: "low-tone"',
  'label: "Low tone"',
  'display: "\\u25CC\\u0300"',
  'value: "\\u0300"',
]) {
  has(ewe, marker, `EWE mark authority ${marker}`);
}

assert.strictEqual(
  count(ewe, 'replacementGroup: "ewe-primary-diacritic"'),
  3,
  "All three current Ewe palette marks must share one replacement slot.",
);

for (const marker of [
  "applyCombiningMarkAtSelection",
  "replacementMarkValues",
  "replacementGroup",
  "preservedMarks",
  '"INVALID_MARK"',
  '"NO_BASE_LETTER"',
  '"INVALID_SELECTION"',
  '"DUPLICATE_MARK"',
  "EDUCATIONAL_COMBINING_MARK_RE",
  "EDUCATIONAL_SINGLE_GRAPHEME_RE",
  'normalize("NFD")',
  'normalize("NFC")',
]) {
  has(text, marker, `text mark helper ${marker}`);
}

for (const marker of [
  "type GhanaianLanguageInputMark",
  "onApplyMark: (mark: GhanaianLanguageInputMark) => void;",
  "language.inputMarks ?? []",
  "markButtons",
  "mark.display",
  "mark.label",
  "props.onApplyMark(mark)",
  "event.preventDefault()",
  "createPortal(",
  "window.visualViewport",
  "For a mark, place the cursor after a letter, then tap the mark.",
]) {
  has(palette, marker, `palette mark behavior ${marker}`);
}

for (const marker of [
  "applyCombiningMarkAtSelection",
  "function insertGhanaianInputMark",
  "candidate.replacementGroup === replacementGroup",
  "mark.replacementGroup",
  'selection.target === "translation"',
  'textarea[data-translation-draft-field="${selection.fieldKey}"]',
  'textarea[data-lesson-field="${selection.fieldKey}"]',
  'target: "translation"',
  'target: "lesson"',
]) {
  has(editor, marker, `editor dual-target mark behavior ${marker}`);
}

const handlerStart = editor.indexOf("  function insertGhanaianInputMark");
const handlerEnd = editor.indexOf("  function getLessonFieldValue", handlerStart);
assert(handlerStart >= 0 && handlerEnd > handlerStart, "Input-mark editor handler boundary missing.");
const handler = editor.slice(handlerStart, handlerEnd);

for (const forbidden of [
  "fetch(",
  "apiJson(",
  "/upsert",
  "/submit",
  "saveDraft(",
  "submitNow(",
]) {
  assert(
    !handler.includes(forbidden),
    `Input-mark handler must remain local-only: ${forbidden}`,
  );
}

const transpiled = ts.transpileModule(text, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const moduleBox = { exports: {} };
new Function("module", "exports", "require", transpiled)(
  moduleBox,
  moduleBox.exports,
  require,
);

const applyCombiningMarkAtSelection =
  moduleBox.exports.applyCombiningMarkAtSelection;

assert.strictEqual(
  typeof applyCombiningMarkAtSelection,
  "function",
  "Compiled combining-mark helper export missing.",
);

const tilde = "\u0303";
const acute = "\u0301";
const grave = "\u0300";
const ewePrimaryDiacriticGroup = [tilde, acute, grave];

const nasal = applyCombiningMarkAtSelection(
  "\u0254",
  1,
  1,
  tilde,
  ewePrimaryDiacriticGroup,
);
assert.deepStrictEqual(
  nasal,
  { ok: true, value: "\u0254\u0303", cursor: 2 },
  "Collapsed cursor after open-o must produce open-o + combining tilde.",
);

const duplicate = applyCombiningMarkAtSelection(
  nasal.value,
  nasal.cursor,
  nasal.cursor,
  tilde,
  ewePrimaryDiacriticGroup,
);
assert.deepStrictEqual(
  duplicate,
  { ok: false, reason: "DUPLICATE_MARK" },
  "Identical Ewe mark must not duplicate on the same grapheme.",
);

const highReplacingNasal = applyCombiningMarkAtSelection(
  nasal.value,
  nasal.cursor,
  nasal.cursor,
  acute,
  ewePrimaryDiacriticGroup,
);
assert.strictEqual(
  highReplacingNasal.ok,
  true,
  "High tone must be able to replace the existing nasal palette mark.",
);
assert.strictEqual(
  highReplacingNasal.value,
  "\u0254\u0301",
  "High tone must replace nasal instead of stacking.",
);
assert.strictEqual(
  Array.from(highReplacingNasal.value.normalize("NFD")).slice(1).length,
  1,
  "Exactly one Ewe palette mark may remain on the grapheme after replacement.",
);

const lowReplacingHigh = applyCombiningMarkAtSelection(
  highReplacingNasal.value,
  highReplacingNasal.cursor,
  highReplacingNasal.cursor,
  grave,
  ewePrimaryDiacriticGroup,
);
assert.strictEqual(
  lowReplacingHigh.ok,
  true,
  "Low tone must be able to replace an existing high tone.",
);
assert.strictEqual(
  lowReplacingHigh.value,
  "\u0254\u0300",
  "Low tone must replace high tone instead of stacking.",
);
assert.strictEqual(
  Array.from(lowReplacingHigh.value.normalize("NFD")).slice(1).length,
  1,
  "Exactly one Ewe palette mark may remain after changing high tone to low tone.",
);

const nasalReplacingLow = applyCombiningMarkAtSelection(
  lowReplacingHigh.value,
  lowReplacingHigh.cursor,
  lowReplacingHigh.cursor,
  tilde,
  ewePrimaryDiacriticGroup,
);
assert.strictEqual(
  nasalReplacingLow.ok,
  true,
  "Nasal must be able to replace an existing low tone.",
);
assert.strictEqual(
  nasalReplacingLow.value,
  "\u0254\u0303",
  "Nasal must replace low tone instead of stacking.",
);

const selectedLetter = applyCombiningMarkAtSelection(
  "\u0254",
  0,
  1,
  tilde,
  ewePrimaryDiacriticGroup,
);
assert.strictEqual(
  selectedLetter.ok,
  true,
  "Single selected letter should accept an Ewe mark.",
);
assert.strictEqual(
  selectedLetter.value,
  "\u0254\u0303",
  "Selected open-o should receive the requested mark.",
);

const noBase = applyCombiningMarkAtSelection(
  "",
  0,
  0,
  tilde,
  ewePrimaryDiacriticGroup,
);
assert.deepStrictEqual(
  noBase,
  { ok: false, reason: "NO_BASE_LETTER" },
  "Empty cursor position must fail safely.",
);

const punctuation = applyCombiningMarkAtSelection(
  "a.",
  2,
  2,
  tilde,
  ewePrimaryDiacriticGroup,
);
assert.deepStrictEqual(
  punctuation,
  { ok: false, reason: "NO_BASE_LETTER" },
  "Cursor after punctuation must fail safely rather than corrupt text.",
);

/*
 * Generic language-core proof:
 * if a future verified language defines separate groups, marks outside the
 * supplied replacement group remain preserved. The Ewe registry currently
 * supplies all three palette marks in one group, so its UI remains single-slot.
 */
const genericFirst = applyCombiningMarkAtSelection(
  "a",
  1,
  1,
  tilde,
  [tilde],
);
assert.strictEqual(genericFirst.ok, true);

const genericIndependent = applyCombiningMarkAtSelection(
  genericFirst.value,
  genericFirst.cursor,
  genericFirst.cursor,
  acute,
  [acute, grave],
);
assert.strictEqual(
  genericIndependent.ok,
  true,
  "Generic helper must still permit independently verified mark groups.",
);
assert.strictEqual(
  genericIndependent.value,
  "a\u0303\u0301".normalize("NFC"),
  "Generic helper should preserve a mark outside the supplied replacement group while preserving NFC normalization.",
);

console.log("GREEN — LANGUAGE-AGNOSTIC INPUT-MARK CONTRACT");
console.log("GREEN — EWE NASAL + HIGH-TONE + LOW-TONE SHARE ONE REPLACEMENT SLOT");
console.log("GREEN — DIFFERENT EWE PALETTE MARK REPLACES PREVIOUS MARK / NO STACKING");
console.log("GREEN — DUPLICATE IDENTICAL EWE MARK FAILS SAFE");
console.log("GREEN — GENERIC CORE STILL SUPPORTS SEPARATE VERIFIED GROUPS FOR FUTURE LANGUAGES");
console.log("GREEN — DOTTED-CIRCLE DISPLAY IS VISUAL / COMBINING VALUE IS INSERTED");
console.log("GREEN — COLLAPSED CURSOR + SINGLE-LETTER SELECTION SUPPORTED");
console.log("GREEN — PUNCTUATION / NO-BASE FAILS SAFE");
console.log("GREEN — NFC NORMALIZATION PRESERVED");
console.log("GREEN — LESSON FIELD + TRANSLATION DRAFT TARGETS PRESERVED");
console.log("GREEN — INPUT MARK EDITING IS LOCAL ONLY / ZERO FETCH / ZERO SAVE");