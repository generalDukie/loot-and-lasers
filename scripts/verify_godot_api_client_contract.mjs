/**
 * Run Godot headless GameApiClient contract tests (Pipeline 2).
 * Spins up a tiny flaky HTTP stub for safe-read retry / mutation non-retry proof.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROJECT = path.join(ROOT, "loot&lasers");
const SCENE = "res://Scripts/test_api_client_contract.tscn";

function resolveGodot() {
  const explicit = process.env.GODOT_PATH;
  const fileCandidates = [
    explicit,
    path.join(
      process.env.USERPROFILE || "",
      "Downloads",
      "Godot_v4.7.1-stable_win64.exe",
      "Godot_v4.7.1-stable_win64_console.exe"
    ),
    path.join(
      process.env.USERPROFILE || "",
      "Downloads",
      "Godot_v4.7.1-stable_win64.exe",
      "Godot_v4.7.1-stable_win64.exe"
    ),
  ].filter(Boolean);

  for (const c of fileCandidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error("Godot 4.7.1 executable not found. Set GODOT_PATH.");
}

function startFlakyStub() {
  const counts = { reads: 0, mutations: 0 };
  const server = http.createServer((req, res) => {
    const url = req.url || "/";
    if (url.startsWith("/flaky-read") && req.method === "GET") {
      counts.reads += 1;
      if (counts.reads === 1) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "busy", code: "INTERNAL_ERROR" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, success: true }));
      return;
    }
    if (url.startsWith("/api/functions/") && req.method === "POST") {
      counts.mutations += 1;
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "busy", code: "INTERNAL_ERROR" }));
      return;
    }
    if (url.startsWith("/counts")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(counts));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found", code: "NOT_FOUND" }));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        server,
        base: `http://127.0.0.1:${addr.port}`,
        counts,
      });
    });
  });
}

const godot = resolveGodot();
const stub = await startFlakyStub();
const args = ["--headless", "--path", PROJECT, SCENE];
console.log(`[verify:godot-api-client] stub=${stub.base}`);
console.log(`[verify:godot-api-client] ${godot} ${args.join(" ")}`);

const child = spawn(godot, args, {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    LOOT_API_CLIENT_TEST_BASE: stub.base,
  },
});

let out = "";
const append = (d) => {
  const s = d.toString();
  out += s;
  process.stdout.write(s);
};
child.stdout.on("data", append);
child.stderr.on("data", append);

const timedOut = setTimeout(() => {
  console.error("FAIL godot api client contract timed out");
  child.kill();
  stub.server.close();
  process.exit(1);
}, 90000);

child.on("close", (code) => {
  clearTimeout(timedOut);
  stub.server.close();
  if (out.includes("API_CLIENT_CONTRACT_TEST_OK") && code === 0) {
    console.log("PASS godot api client contract");
    process.exit(0);
  }
  console.error("FAIL godot api client contract");
  process.exit(code === 0 ? 1 : code || 1);
});

child.on("error", (err) => {
  clearTimeout(timedOut);
  stub.server.close();
  console.error(err);
  process.exit(1);
});
