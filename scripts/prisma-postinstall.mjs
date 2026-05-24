// scripts/prisma-postinstall.mjs

import { spawnSync } from "node:child_process";

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
      2
    )
  );

  process.exit(0);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      event: "PRISMA_POSTINSTALL_START",
      command: "prisma generate",
    },
    null,
    2
  )
);

const result = spawnSync("npx", ["prisma", "generate"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        event: "PRISMA_POSTINSTALL_ERROR",
        error: result.error.message,
      },
      null,
      2
    )
  );

  process.exit(1);
}

process.exit(result.status ?? 1);