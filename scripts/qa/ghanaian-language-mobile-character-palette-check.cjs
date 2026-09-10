"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const palettePath = "src/components/teacher/GhanaianLanguageCharacterPalette.tsx";
const editorPath = "src/app/teacher/lesson-notes/[id]/ui/LessonNoteEditorClient.tsx";

const palette = read(palettePath);
const editor = read(editorPath);

assert(
  palette.includes('import { createPortal } from "react-dom";'),
  "Mobile Ghanaian-language palette must render through a document-level React portal.",
);

assert(
  palette.includes("const [mounted, setMounted] = useState(false);"),
  "Palette must gate the portal until the client is mounted.",
);

assert(
  palette.includes("setMounted(true);"),
  "Palette must mark the client as mounted before using document.body.",
);

assert(
  palette.includes("mounted && props.mobileActive"),
  "Mobile palette must require both mounted client state and an active Lesson Note field.",
);

assert(
  palette.includes("createPortal(") && palette.includes("document.body"),
  "Mobile palette must escape filtered/backdrop-filter Lesson Note ancestors by portaling to document.body.",
);

assert(
  palette.includes('className="fixed inset-x-1.5 z-[65] md:hidden"'),
  "Mobile palette must remain viewport-fixed, high-z-index, and hidden from desktop layout.",
);

assert(
  palette.includes("window.visualViewport"),
  "Mobile palette must continue accounting for the visual viewport / software keyboard.",
);

assert(
  palette.includes('viewport?.addEventListener("resize", syncMobileBottom)'),
  "Palette must keep visualViewport resize tracking.",
);

assert(
  palette.includes('viewport?.addEventListener("scroll", syncMobileBottom)'),
  "Palette must keep visualViewport scroll tracking.",
);

assert(
  palette.includes('onPointerDown={(event) => event.preventDefault()}'),
  "Character buttons must preserve textarea focus/cursor on pointer interaction.",
);

assert(
  editor.includes("mobileActive={Boolean(activeLanguageField)}"),
  "Lesson Note editor must still activate the mobile palette only for an active editable field.",
);

assert(
  editor.includes("onActiveChange={setActiveLanguageField}"),
  "Lesson Note fields must continue driving active mobile palette state.",
);

assert(
  editor.includes('backdrop-blur-xl'),
  "Regression harness expects the current filtered Lesson Note card context that requires the document-level portal.",
);

console.log("GREEN — Ghanaian Language mobile character palette portals to document.body while preserving active-field, cursor, and visualViewport behavior.");
