"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- deterministic TypeScript helper runtime QA. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");
const helperPath = path.join(
  repoRoot,
  "src/lib/lessonNotes/protectedTranslationTokens.ts",
);

function fail(message, detail) {
  const suffix =
    detail === undefined
      ? ""
      : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

const source = fs.readFileSync(helperPath, "utf8");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: helperPath,
}).outputText;

const moduleObject = { exports: {} };

function normalizeEducationalText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .normalize("NFC");
}

function localRequire(id) {
  if (id === "@/lib/lessonNotes/translationContract") {
    return {
      TRANSLATION_PROTECTED_TOKEN_VERSION:
        "EDULIFE_TRANSLATION_PROTECTED_TOKEN_V1",
      normalizeTranslationText(value) {
        return normalizeEducationalText(value).trim();
      },
    };
  }

  if (id === "@/lib/ghanaianLanguages/text") {
    return {
      normalizeEducationalText,
    };
  }

  throw new Error(`Unexpected QA require: ${id}`);
}

const execute = new Function(
  "require",
  "module",
  "exports",
  transpiled,
);

execute(
  localRequire,
  moduleObject,
  moduleObject.exports,
);

const {
  createProtectedTranslationBypassPlan,
  getProtectedTranslationModelInputs,
  assembleProtectedTranslationBypass,
} = moduleObject.exports;

assert(
  typeof createProtectedTranslationBypassPlan === "function" &&
    typeof getProtectedTranslationModelInputs === "function" &&
    typeof assembleProtectedTranslationBypass === "function",
  "Protected bypass exports missing",
);

const sourceOne =
  "The curriculum indicator is B8.1.1.1.";

const planOne =
  createProtectedTranslationBypassPlan(sourceOne);

assert(
  planOne.protectedTokenCount === 1,
  "Single-code protected count mismatch",
  planOne,
);

assert(
  planOne.modelInputCount === 1,
  "Single-code model input count mismatch",
  planOne,
);

assert(
  JSON.stringify(planOne.segments) ===
    JSON.stringify([
      {
        kind: "MODEL_TEXT",
        text: "The curriculum indicator is ",
      },
      {
        kind: "PROTECTED_TOKEN",
        text: "B8.1.1.1",
      },
      {
        kind: "LITERAL_TEXT",
        text: ".",
      },
    ]),
  "Single-code segmentation mismatch",
  planOne.segments,
);

const inputsOne =
  getProtectedTranslationModelInputs(planOne);

assert(
  inputsOne.length === 1 &&
    inputsOne[0] === "The curriculum indicator is " &&
    !inputsOne[0].includes("B8.1.1.1"),
  "Protected code leaked into model input",
  inputsOne,
);

const assembledOne =
  assembleProtectedTranslationBypass(
    planOne,
    ["Nusrɔ̃ɖoɖo ƒe dzesi nye "],
  );

assert(
  assembledOne ===
    "Nusrɔ̃ɖoɖo ƒe dzesi nye B8.1.1.1.",
  "Protected token was not reassembled exactly",
  assembledOne,
);

const codeOnly =
  createProtectedTranslationBypassPlan(
    "B8.1.1.1",
  );

assert(
  codeOnly.modelInputCount === 0 &&
    codeOnly.protectedTokenCount === 1 &&
    getProtectedTranslationModelInputs(codeOnly).length === 0 &&
    assembleProtectedTranslationBypass(
      codeOnly,
      [],
    ) === "B8.1.1.1",
  "Code-only bypass must perform zero model inference",
  codeOnly,
);

const multi =
  createProtectedTranslationBypassPlan(
    "Compare B8.1.1.1 with JHS2.3.4.5, then explain.",
  );

const multiInputs =
  getProtectedTranslationModelInputs(multi);

assert(
  multi.protectedTokenCount === 2,
  "Multi-code protected count mismatch",
  multi,
);

for (const modelInput of multiInputs) {
  assert(
    !/\b[A-Za-z]{1,8}\d{1,3}(?:\.\d{1,4}){2,8}\b/.test(
      modelInput,
    ),
    "Curriculum code entered a model segment",
    { modelInput },
  );
}

let mismatchFailed = false;

try {
  assembleProtectedTranslationBypass(
    planOne,
    [],
  );
} catch (error) {
  mismatchFailed =
    String(error?.message ?? error) ===
    "TRANSLATION_PROTECTED_TOKEN_MODEL_RESULT_COUNT_MISMATCH";
}

assert(
  mismatchFailed,
  "Model-result count mismatch must fail closed",
);

const tampered = {
  ...planOne,
  sourceText:
    "The curriculum indicator is B8.1.1.2.",
};

let integrityFailed = false;

try {
  getProtectedTranslationModelInputs(
    tampered,
  );
} catch (error) {
  integrityFailed =
    String(error?.message ?? error) ===
    "TRANSLATION_PROTECTED_TOKEN_INTEGRITY_FAILED";
}

assert(
  integrityFailed,
  "Tampered plan must fail integrity verification",
);

console.log("=== PROTECTED TRANSLATION BYPASS RUNTIME QA ===");
console.log("Curriculum code transport : NEVER SENT TO MODEL");
console.log("Literal punctuation         : BYPASSES MODEL");
console.log("Code-only input             : ZERO MODEL CALLS");
console.log("Exact protected assembly    : GREEN");
console.log("Result-count fail-closed    : GREEN");
console.log("Plan tamper fail-closed     : GREEN");
console.log("Protected bypass QA         : GREEN");
