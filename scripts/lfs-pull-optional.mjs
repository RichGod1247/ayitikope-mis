// scripts/lfs-pull-optional.mjs
import { spawnSync } from "node:child_process";

const gitExecutable =
  process.platform === "win32" ? "git.exe" : "git";

function run(args) {
  const result = spawnSync(gitExecutable, args, {
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });

  if (result.error) {
    console.warn(
      `[lfs] Unable to start Git LFS: ${result.error.code ?? "SPAWN_FAILED"}.`,
    );
    return 1;
  }

  return typeof result.status === "number" ? result.status : 1;
}

console.log("[lfs] Attempting optional Git LFS pull for public assets...");

const installStatus = run(["lfs", "install", "--local"]);
const pullStatus = run(["lfs", "pull", "--include=public/**"]);

if (installStatus !== 0 || pullStatus !== 0) {
  console.warn(
    "[lfs] Git LFS pull failed or LFS budget is unavailable. Continuing build without failing deployment.",
  );
  process.exit(0);
}

console.log("[lfs] Git LFS pull completed.");
