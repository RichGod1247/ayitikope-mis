"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness parses local package metadata. */

const fs = require("node:fs");
const path = require("node:path");

const sourceOnly = process.argv.includes("--source-only");
const repositoryRoot = process.cwd();

function fail(code, details = "") {
  const suffix = details ? `:${details}` : "";
  throw new Error(`${code}${suffix}`);
}

function readJson(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    fail("ZXING_COMPAT_FILE_MISSING", relativePath);
  }

  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function readText(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    fail("ZXING_COMPAT_FILE_MISSING", relativePath);
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function assertEqual(actual, expected, code) {
  if (actual !== expected) {
    fail(code, `expected=${expected};actual=${String(actual)}`);
  }
}

function assertIncludes(text, marker, code) {
  if (!text.includes(marker)) {
    fail(code, marker);
  }
}

function assertNotIncludes(text, marker, code) {
  if (text.includes(marker)) {
    fail(code, marker);
  }
}

function collectFiles(rootPath, extension) {
  const files = [];

  if (!fs.existsSync(rootPath)) {
    return files;
  }

  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const absolutePath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(absolutePath);
    }
  }

  return files;
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const lockPackages = packageLock.packages;

if (!lockPackages || typeof lockPackages !== "object") {
  fail("ZXING_COMPAT_LOCK_PACKAGES_MISSING");
}

const rootLock = lockPackages[""];
const browserLock = lockPackages["node_modules/@zxing/browser"];
const libraryLock = lockPackages["node_modules/@zxing/library"];
const customErrorLock = lockPackages["node_modules/ts-custom-error"];

if (!rootLock || !browserLock || !libraryLock || !customErrorLock) {
  fail("ZXING_COMPAT_REQUIRED_LOCK_ENTRY_MISSING");
}

assertEqual(packageJson.engines?.node, "22.x", "ZXING_COMPAT_NODE_CONTRACT");
assertEqual(
  packageJson.dependencies?.["@zxing/browser"],
  "0.1.5",
  "ZXING_COMPAT_BROWSER_NOT_PINNED",
);
assertEqual(
  packageJson.dependencies?.["@zxing/library"],
  "0.21.3",
  "ZXING_COMPAT_LIBRARY_NOT_PINNED",
);
assertEqual(
  rootLock.dependencies?.["@zxing/browser"],
  "0.1.5",
  "ZXING_COMPAT_LOCK_BROWSER_NOT_PINNED",
);
assertEqual(
  rootLock.dependencies?.["@zxing/library"],
  "0.21.3",
  "ZXING_COMPAT_LOCK_LIBRARY_NOT_PINNED",
);
assertEqual(browserLock.version, "0.1.5", "ZXING_COMPAT_BROWSER_LOCK_VERSION");
assertEqual(libraryLock.version, "0.21.3", "ZXING_COMPAT_LIBRARY_LOCK_VERSION");
assertEqual(
  browserLock.peerDependencies?.["@zxing/library"],
  "^0.21.0",
  "ZXING_COMPAT_BROWSER_PEER_RANGE",
);
assertEqual(
  libraryLock.engines?.node,
  ">= 10.4.0",
  "ZXING_COMPAT_LIBRARY_ENGINE_RANGE",
);
assertEqual(
  libraryLock.dependencies?.["ts-custom-error"],
  "^3.2.1",
  "ZXING_COMPAT_LIBRARY_CUSTOM_ERROR_RANGE",
);
assertEqual(
  browserLock.integrity,
  "sha512-4Lmrn/il4+UNb87Gk8h1iWnhj39TASEHpd91CwwSJtY5u+wa0iH9qS0wNLAWbNVYXR66WmT5uiMhZ7oVTrKfxw==",
  "ZXING_COMPAT_BROWSER_INTEGRITY",
);
assertEqual(
  libraryLock.integrity,
  "sha512-hZHqFe2JyH/ZxviJZosZjV+2s6EDSY0O24R+FQmlWZBZXP9IqMo7S3nb3+2LBWxodJQkSurdQGnqE7KXqrYgow==",
  "ZXING_COMPAT_LIBRARY_INTEGRITY",
);

if (Object.prototype.hasOwnProperty.call(libraryLock, "peer")) {
  fail("ZXING_COMPAT_LIBRARY_MUST_BE_DIRECT");
}

if (Object.prototype.hasOwnProperty.call(customErrorLock, "peer")) {
  fail("ZXING_COMPAT_CUSTOM_ERROR_MUST_NOT_BE_PEER_ONLY");
}

const serializedZxingLocks = JSON.stringify({ browserLock, libraryLock });
assertNotIncludes(
  serializedZxingLocks,
  ">= 24.0.0",
  "ZXING_COMPAT_NODE24_ENGINE_REMAINS",
);
assertNotIncludes(
  JSON.stringify(packageJson.dependencies),
  "^0.2.0",
  "ZXING_COMPAT_STALE_BROWSER_RANGE",
);
assertNotIncludes(
  JSON.stringify(rootLock.dependencies),
  "^0.2.0",
  "ZXING_COMPAT_STALE_LOCK_BROWSER_RANGE",
);

const scannerSource = readText(
  "src/components/attendance/QrCameraScanner.tsx",
);

for (const [marker, code] of [
  [
    'import type { IScannerControls } from "@zxing/browser";',
    "ZXING_COMPAT_SCANNER_CONTROLS_IMPORT",
  ],
  [
    'typeof import("@zxing/browser").BrowserQRCodeReader',
    "ZXING_COMPAT_SCANNER_READER_TYPE",
  ],
  [
    'const mod = await import("@zxing/browser");',
    "ZXING_COMPAT_SCANNER_DYNAMIC_IMPORT",
  ],
  [
    "const reader = new BrowserQRCodeReader();",
    "ZXING_COMPAT_SCANNER_READER_CONSTRUCTION",
  ],
  [
    "reader.decodeFromConstraints(",
    "ZXING_COMPAT_SCANNER_DECODE_API",
  ],
  ["controlsRef.current?.stop();", "ZXING_COMPAT_SCANNER_STOP_API"],
  ["result.getText()", "ZXING_COMPAT_SCANNER_RESULT_API"],
]) {
  assertIncludes(scannerSource, marker, code);
}

let installedVerification = "deferred (--source-only)";

if (!sourceOnly) {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);

  assertEqual(nodeMajor, 22, "ZXING_COMPAT_QA_MUST_RUN_ON_NODE22");

  const installedBrowser = readJson("node_modules/@zxing/browser/package.json");
  const installedLibrary = readJson("node_modules/@zxing/library/package.json");

  assertEqual(
    installedBrowser.version,
    "0.1.5",
    "ZXING_COMPAT_INSTALLED_BROWSER_VERSION",
  );
  assertEqual(
    installedLibrary.version,
    "0.21.3",
    "ZXING_COMPAT_INSTALLED_LIBRARY_VERSION",
  );
  assertEqual(
    installedLibrary.engines?.node,
    ">= 10.4.0",
    "ZXING_COMPAT_INSTALLED_LIBRARY_ENGINE",
  );

  const declarationRoot = path.join(
    repositoryRoot,
    "node_modules",
    "@zxing",
    "browser",
    "esm",
  );
  const declarationFiles = collectFiles(declarationRoot, ".d.ts");

  if (declarationFiles.length === 0) {
    fail("ZXING_COMPAT_BROWSER_DECLARATIONS_MISSING");
  }

  const declarations = declarationFiles
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  for (const [marker, code] of [
    ["IScannerControls", "ZXING_COMPAT_TYPES_CONTROLS_MISSING"],
    ["stop: () => void", "ZXING_COMPAT_TYPES_STOP_MISSING"],
    [
      "decodeFromConstraints",
      "ZXING_COMPAT_TYPES_DECODE_CONSTRAINTS_MISSING",
    ],
    ["BrowserQRCodeReader", "ZXING_COMPAT_TYPES_QR_READER_MISSING"],
  ]) {
    assertIncludes(declarations, marker, code);
  }

  installedVerification = "exact package versions + scanner typings";
}

console.log("");
console.log("=== D3.5B1C NODE 22 ZXING COMPATIBILITY ===");
console.log("");
console.log("Project runtime contract : Node 22.x");
console.log("Browser package          : exact 0.1.5");
console.log("Library package          : exact 0.21.3");
console.log("Node 24-only engine      : absent");
console.log("Scanner source API       : compatible contract preserved");
console.log(`Installed verification  : ${installedVerification}`);
console.log("Database accessed        : false");
console.log("Provider called          : false");
console.log("");
console.log("RESULT: D3.5B1C NODE 22 ZXING COMPATIBILITY GREEN");
