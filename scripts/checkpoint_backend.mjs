/**
 * Optional checkpoint: run backend verification + show status; never commits/pushes.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", shell: true });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const verify = await run("node", ["scripts/verify_backend.mjs"]);
if (verify !== 0) {
  console.error("\ncheckpoint:backend aborted — verification failed.");
  process.exit(1);
}

console.log("\n--- git status ---");
await run("git", ["status"]);
console.log("\ncheckpoint:backend OK. Commit only with an explicit message; push only when asked.");
process.exit(0);
