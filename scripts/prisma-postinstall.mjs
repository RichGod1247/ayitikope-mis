// scripts/prisma-postinstall.mjs

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function clean(value) {
  return String(value ?? "").trim().toLowerCase();
}

const skip = clean(process.env.SKIP_PRISMA_GENERATE);

if (skip === "1" || skip === "true" || skip === "yes") {
  console.log(
    JSON.stringify(
      {
        ok: true,
        event: "PRISMA_POSTINSTALL_SKIPPED",
        reason: "SKIP_PRISMA_GENERATE is enabled for this component.",
      },
      null,
      2,
    ),
  );

  process.exit(0);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const prismaCli = path.join(
  repositoryRoot,
  "node_modules",
  "prisma",
  "build",
  "index.js",
);

if (!existsSync(prismaCli)) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        event: "PRISMA_POSTINSTALL_ERROR",
        error: "LOCAL_PRISMA_CLI_NOT_FOUND",
      },
      null,
      2,
    ),
  );

  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      event: "PRISMA_POSTINSTALL_START",
      command: "prisma generate",
    },
    null,
    2,
  ),
);

const result = spawnSync(process.execPath, [prismaCli, "generate"], {
  stdio: "inherit",
  shell: false,
  windowsHide: true,
  env: process.env,
});

if (result.error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        event: "PRISMA_POSTINSTALL_ERROR",
        error: result.error.code ?? "PRISMA_GENERATE_SPAWN_FAILED",
      },
      null,
      2,
    ),
  );

  process.exit(1);
}

process.exit(result.status ?? 1);
