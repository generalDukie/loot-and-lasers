import assert from "node:assert/strict";
import fs from "node:fs";

const auth = fs.readFileSync("server/src/auth.js", "utf8");
const runtime = fs.readFileSync("modules/account.lua", "utf8");
const client = fs.readFileSync("loot&lasers/Autoload/AuthManager.gd", "utf8");
const login = fs.readFileSync("loot&lasers/Scenes/UI/login.gd", "utf8");
const compose = fs.readFileSync("docker-compose.yml", "utf8");

assert.match(auth, /setNakamaPassword\(row, newPassword\)/);
assert.match(auth, /router\.post\("\/reset-password"/);
assert.match(auth, /router\.post\("\/change-password"/);
assert.match(runtime, /nk\.register_rpc\(password_set, "auth_password_set"\)/);
assert.match(runtime, /context\.user_id ~= nil/);
assert.match(runtime, /nk\.bcrypt_hash\(password\)/);
assert.match(client, /NakamaManager\.authenticate_email\(email, current_password, false\)/);
assert.match(client, /\/api\/auth\/reset-password-request/);
assert.match(login, /AuthManager\.reset_password\(_reset_token\.text, _reset_pw\.text\)/);
assert.match(compose, /--runtime\.http_key/);

console.log("PASSWORD_FLOW_VERIFY_OK");
