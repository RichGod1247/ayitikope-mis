//scripts/lfs-pull-optional.mjs
import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  return typeof result.status === "number" ? result.status : 1;
}

console.log("[lfs] Attempting optional Git LFS pull for public assets...");

const installStatus = run("git", ["lfs", "install", "--local"]);
const pullStatus = run("git", ["lfs", "pull", "--include=public/**"]);

if (installStatus !== 0 || pullStatus !== 0) {
  console.warn(
    "[lfs] Git LFS pull failed or LFS budget is unavailable. Continuing build without failing deployment."
  );
  process.exit(0);
}

console.log("[lfs] Git LFS pull completed.");