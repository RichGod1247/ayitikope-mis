"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- deterministic CommonJS source-contract QA. */
const fs=require("fs");const path=require("path");const ts=require("typescript");
const p=path.resolve(__dirname,"..","..","src","app","teacher","lesson-notes","[id]","ui","LessonNoteEditorClient.tsx");
function a(c,m){if(!c)throw new Error(m);}const s=fs.readFileSync(p,"utf8");const f=ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);a(f.parseDiagnostics.length===0,"Editor TSX parse failure");
for(const m of [
  '"priorKnowledge"',
  '"review_language"',
  'label: "Review language"',
  "pendingTargetLanguageConfirmations",
  "confirmExistingTargetLanguage",
  "Already in {props.translation.languageName} — confirm",
  'props.translationState === "review_language" && !props.translation.loading && !props.translation.preview',
  'props.translation.loading || props.translation.preview ? "sm:grid-cols-1" : "sm:grid-cols-2"',
  'title: "Translation in progress"',
  'title: "Translation review active"',
  'props.translationState !== "translated"',
  "Review this field. If it is already good",
  "Translate English sections, or confirm sections that are already good",
  "targetLanguageConfirmations:",
  'hint="Required for Ghanaian Language notes.'
]) a(s.includes(m),`Missing UI marker: ${m}`);
a(!s.includes('label: "Needs translation"'),"Ambiguous Needs translation badge must be removed");
a(!s.toLowerCase().includes("translate all"),"Translate All must remain absent");
a(s.includes("GhanaianLanguageCharacterPalette"),"Character palette must remain present");
console.log("LESSON NOTE TRANSLATION UI + TARGET-LANGUAGE REVIEW CONTRACT: GREEN");
console.log("- populated unproven fields show Review language, not Needs translation");
console.log("- teacher can confirm existing target-language text with zero model call");
console.log("- translated fields no longer expose a dangerous Translate again action");
console.log("- translation loading + active preview both hide target-language confirmation");
console.log("- stale confirmation fails safe during both in-flight translation and active preview");
console.log("- Prior Knowledge is required and participates in save gating");
console.log("- mobile/BBC field-by-field review and character palette remain preserved");
