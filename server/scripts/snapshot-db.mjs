/** Create a transactionally consistent SQLite snapshot for encrypted offsite backup. */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../src/db.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(scriptDir, "../data");

function readOutputPath(argv) {
  const index = argv.indexOf("--out");
  if (index < 0 || !argv[index + 1]) throw new Error("Usage: snapshot-db.mjs --out <path>");
  const output = path.resolve(argv[index + 1]);
  const relative = path.relative(dataDir, output);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Snapshot output must stay inside ${dataDir}`);
  }
  return output;
}

const output = readOutputPath(process.argv);
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite existing snapshot: ${output}`);
fs.mkdirSync(path.dirname(output), { recursive: true });
const quotedOutput = output.replaceAll("'", "''");
db.exec(`VACUUM INTO '${quotedOutput}'`);
fs.chmodSync(output, 0o600);
const checksumBuilder = createHash("sha256");
for await (const chunk of fs.createReadStream(output)) checksumBuilder.update(chunk);
const checksum = checksumBuilder.digest("hex");
fs.writeFileSync(`${output}.sha256`, `${checksum}  ${path.basename(output)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ snapshot: output, sha256: checksum }));
