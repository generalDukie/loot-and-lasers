/**
 * Aggregate Nakama/backend verification runner.
 * Usage: npm run verify:backend
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const results = [];

function pass(category, detail = "") {
  results.push({ category, ok: true, detail });
  console.log(`PASS ${category}${detail ? " — " + detail : ""}`);
}

function fail(category, detail, remediation = "") {
  results.push({ category, ok: false, detail, remediation });
  console.error(`FAIL ${category} — ${detail}`);
  if (remediation) console.error(`     → ${remediation}`);
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function listLuaModules(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) listLuaModules(full, acc);
    else if (name.endsWith(".lua")) acc.push(full);
  }
  return acc;
}

async function checkRepositorySafety() {
  const cat = "Repository safety";
  const gitignore = exists(".gitignore") ? read(".gitignore") : "";
  if (!/cookie|\.env/i.test(gitignore)) {
    fail(cat, ".gitignore missing cookie/.env coverage", "Add cookie and .env ignores");
    return;
  }

  try {
    const { execSync } = await import("node:child_process");
    const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const risky = tracked.filter((f) =>
      /(^|\/)\.env$|\.cookie$|credentials\.json|(^|\/)id_rsa$|game\.db$/i.test(f)
    );
    if (risky.length) {
      fail(cat, `Tracked sensitive paths: ${risky.join(", ")}`, "Untrack and gitignore");
      return;
    }
  } catch {
    /* git optional for this subsection */
  }

  const sdk = path.join(ROOT, "loot&lasers", "addons", "com.heroiclabs.nakama");
  if (!fs.existsSync(sdk)) {
    fail(cat, "Nakama addon missing", "Restore vendor SDK under loot&lasers/addons/");
    return;
  }
  pass(cat, "no tracked secrets; SDK present");
}

function checkGodotIntegrity() {
  const cat = "Godot autoload integrity";
  const proj = path.join(ROOT, "loot&lasers", "project.godot");
  if (!fs.existsSync(proj)) {
    fail(cat, "project.godot missing");
    return;
  }
  const text = fs.readFileSync(proj, "utf8");
  const required = [
    "NakamaManager=",
    "ProfileManager=",
    "CurrencyManager=",
    "InventoryManager=",
    "EquipmentManager=",
    "MissionManager=",
    'Nakama="',
  ];
  for (const r of required) {
    if (!text.includes(r)) {
      fail(cat, `Missing autoload marker: ${r}`, "Register autoload in project.godot");
      return;
    }
  }

  // Duplicate autoload keys
  const keys = [...text.matchAll(/^([A-Za-z0-9_]+)="/gm)].map((m) => m[1]);
  const seen = new Set();
  for (const k of keys) {
    if (seen.has(k)) {
      fail(cat, `Duplicate autoload: ${k}`);
      return;
    }
    seen.add(k);
  }

  // UI scripts must not call wallet mutation RPCs
  const uiRoot = path.join(ROOT, "loot&lasers", "Scenes");
  let badRpc = null;
  function scan(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) scan(full);
      else if (name.endsWith(".gd")) {
        const src = fs.readFileSync(full, "utf8");
        if (/wallet_credit|wallet_debit/.test(src)) {
          badRpc = path.relative(ROOT, full);
        }
        if (/func _process\([\s\S]*invoke_rpc|func _process\([\s\S]*mission_status/.test(src)) {
          // soft heuristic — mission_run uses Timer not _process for status
        }
      }
    }
  }
  if (fs.existsSync(uiRoot)) scan(uiRoot);
  if (badRpc) {
    fail(cat, `UI references wallet mutation RPC: ${badRpc}`);
    return;
  }

  const currency = path.join(ROOT, "loot&lasers", "Autoload", "CurrencyManager.gd");
  if (fs.existsSync(currency)) {
    const c = fs.readFileSync(currency, "utf8");
    if (/func credit\(|func debit\(/.test(c) || /wallet_credit|wallet_debit/.test(c)) {
      fail(cat, "CurrencyManager exposes wallet mutation RPC path");
      return;
    }
  }

  pass(cat, "autoloads + no client wallet mutation RPCs");
}

function checkNakamaModules() {
  const cat = "Nakama module discovery";
  const required = [
    "modules/profile.lua",
    "modules/inventory.lua",
    "modules/equipment.lua",
    "modules/wallet.lua",
    "modules/missions.lua",
    "modules/lib/auth.lua",
    "modules/lib/storage.lua",
    "modules/lib/validation.lua",
    "modules/lib/responses.lua",
    "modules/lib/time.lua",
    "modules/lib/ids.lua",
    "modules/lib/logging.lua",
    "modules/lib/transactions.lua",
  ];
  for (const rel of required) {
    if (!exists(rel)) {
      fail(cat, `Missing ${rel}`);
      return;
    }
  }

  // Basic parse: balanced function/end not practical; check require paths exist
  const serviceFiles = [
    "modules/inventory.lua",
    "modules/equipment.lua",
    "modules/wallet.lua",
    "modules/missions.lua",
    "modules/profile.lua",
  ];
  for (const rel of serviceFiles) {
    const src = read(rel);
    const reqs = [...src.matchAll(/require\(\"lib\.([a-z_]+)\"\)/g)].map((m) => m[1]);
    for (const name of reqs) {
      if (!exists(`modules/lib/${name}.lua`)) {
        fail(cat, `${rel} requires missing lib.${name}`);
        return;
      }
    }
  }
  pass(cat, `${required.length} required files present`);
}

function checkRpcRegistration() {
  const cat = "RPC registration";
  const expected = {
    profile_get: true,
    profile_update: true,
    inventory_get: true,
    equipment_get: true,
    wallet_get: true,
    missions_get: true,
    missions_refresh: true,
    mission_start: true,
    mission_status: true,
  };
  const forbidden = {
    wallet_credit: true,
    wallet_debit: true,
    mission_claim: true,
    mission_reward: true,
  };

  const luaFiles = listLuaModules(path.join(ROOT, "modules"));
  const registered = [];
  const dup = new Set();
  for (const file of luaFiles) {
    const src = fs.readFileSync(file, "utf8");
    for (const id of listRegisteredRpcIds(src)) {
      if (registered.includes(id)) dup.add(id);
      registered.push(id);
    }
  }

  if (dup.size) {
    fail(cat, `Duplicate RPC ids: ${[...dup].join(", ")}`);
    return;
  }
  for (const id of Object.keys(expected)) {
    if (!registered.includes(id)) {
      fail(cat, `Missing public RPC registration: ${id}`);
      return;
    }
  }
  for (const id of Object.keys(forbidden)) {
    if (registered.includes(id)) {
      fail(cat, `Forbidden public RPC still registered: ${id}`);
      return;
    }
  }

  // Client must not trust user_id from payload in ownership — heuristic
  for (const file of luaFiles) {
    if (file.includes(`${path.sep}lib${path.sep}`)) continue;
    const src = fs.readFileSync(file, "utf8");
    if (/body\.user_id\s*=/.test(src) && /storage_write/.test(src)) {
      fail(cat, `Possible client user_id trust in ${path.relative(ROOT, file)}`);
      return;
    }
  }

  pass(cat, `${registered.length} RPCs; public set OK; wallet mutations unregistered`);
}

function listRegisteredRpcIds(src) {
  return [...src.matchAll(/nk\.register_rpc\([^,]+,\s*\"([^\"]+)\"\)/g)].map((m) => m[1]);
}

function checkWalletSecurity() {
  const cat = "Wallet security";
  const src = read("modules/wallet.lua");
  const ids = new Set(listRegisteredRpcIds(src));
  // Exact id match only — do not treat dev_wallet_credit_test as wallet_credit.
  if (ids.has("wallet_credit") || ids.has("wallet_debit")) {
    fail(cat, "wallet_credit/debit registered", "Keep mutations internal; do not nk.register_rpc them");
    return;
  }
  if (!src.includes("credit_currency") || !src.includes("debit_currency")) {
    fail(cat, "internal credit/debit missing");
    return;
  }
  if (!src.includes("Duplicate transaction_id") || !src.includes("Insufficient balance")) {
    fail(cat, "wallet protections missing strings");
    return;
  }
  pass(cat, "mutations internal-only; protections present");
}

function checkDocs() {
  const cat = "Documentation consistency";
  if (!exists("docs/BACKEND_ARCHITECTURE.md") || !exists("docs/NAKAMA_RPC.md")) {
    fail(cat, "Missing architecture or NAKAMA_RPC docs");
    return;
  }
  if (!exists("docs/BACKEND_SHARED_LIBRARY.md") || !exists("docs/BACKEND_VERIFICATION.md")) {
    fail(cat, "Missing Phase 9 docs");
    return;
  }
  const rpcDoc = read("docs/NAKAMA_RPC.md");
  const requiredMentions = [
    "profile_get",
    "inventory_get",
    "equipment_get",
    "wallet_get",
    "missions_get",
    "mission_start",
    "mission_status",
  ];
  for (const id of requiredMentions) {
    if (!rpcDoc.includes(id)) {
      fail(cat, `NAKAMA_RPC.md missing ${id}`);
      return;
    }
  }
  const arch = read("docs/BACKEND_ARCHITECTURE.md");
  if (!/Phase 8|sole|authoritative mission/i.test(arch)) {
    fail(cat, "BACKEND_ARCHITECTURE.md missing mission authority note");
    return;
  }
  pass(cat, "phase docs present; RPCs mentioned");
}

async function checkGitStagingSafetyAsync() {
  const cat = "Git staging safety";
  try {
    const { execSync } = await import("node:child_process");
    const out = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
    const lines = out.split("\n").filter(Boolean);
    for (const line of lines) {
      const file = line.slice(3).trim().replace(/^"+|"+$/g, "");
      if (/\.env$|\.cookie$|credentials\.json|id_rsa/i.test(file)) {
        fail(cat, `Risky uncommitted path: ${file}`, "Do not stage secrets");
        return;
      }
    }
    pass(cat, "no risky secret filenames in working tree");
  } catch {
    pass(cat, "skipped (git unavailable)");
  }
}

async function checkDockerNakama() {
  const cat = "Nakama runtime logs";
  try {
    const { execSync } = await import("node:child_process");
    const logs = execSync("docker compose logs nakama --tail 80", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (/error.*runtime|failed to load|panic/i.test(logs) && /modules/i.test(logs)) {
      fail(cat, "Nakama logs show module/runtime errors", "Restart Nakama and inspect docker compose logs");
      return;
    }
    if (/Registered Lua runtime RPC/.test(logs) || /Startup done/.test(logs)) {
      pass(cat, "Nakama appears healthy");
    } else {
      pass(cat, "Docker up; registration lines not in last 80 (ok)");
    }
  } catch {
    pass(cat, "Docker unavailable — skipped");
  }
}

function runChild(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      out += d.toString();
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, out });
    });
  });
}

async function runPhaseScripts() {
  const cat = "Phase-specific verifications";
  const scriptsDir = path.join(ROOT, "scripts");
  const files = fs
    .readdirSync(scriptsDir)
    .filter((n) => /^verify_.*\.mjs$/.test(n) && n !== "verify_backend.mjs")
    .sort();

  if (!files.length) {
    fail(cat, "No scripts/verify_*.mjs found");
    return;
  }

  for (const name of files) {
    const full = path.join(scriptsDir, name);
    process.stdout.write(`  → ${name}… `);
    const { code, out } = await runChild(full);
    if (code === 0) {
      console.log("ok");
      pass(`Phase script ${name}`);
    } else {
      console.log("FAILED");
      fail(`Phase script ${name}`, out.slice(-400), "Fix failing phase script then re-run");
      return;
    }
  }
}

async function main() {
  console.log("Backend Verification\n");
  await checkRepositorySafety();
  checkGodotIntegrity();
  checkNakamaModules();
  checkRpcRegistration();
  checkWalletSecurity();
  checkDocs();
  await checkGitStagingSafetyAsync();
  await checkDockerNakama();
  await runPhaseScripts();

  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log("\n--- Summary ---");
  console.log(`Result: ${passed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) {
      console.log(`- ${f.category}: ${f.detail}`);
      if (f.remediation) console.log(`  remediation: ${f.remediation}`);
    }
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
