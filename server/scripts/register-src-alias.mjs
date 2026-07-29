/**
 * Register `@/` alias before importing client modules.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(dir, "src-alias-hooks.mjs")).href);
