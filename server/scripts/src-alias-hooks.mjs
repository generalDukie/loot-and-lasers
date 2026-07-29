/**
 * Custom resolve hook for `@/` → project `src/`.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    let rel = specifier.slice(2);
    let target = path.join(root, "src", rel);
    if (!path.extname(target)) {
      if (fs.existsSync(target + ".js")) target += ".js";
      else if (fs.existsSync(target + ".jsx")) target += ".jsx";
      else if (fs.existsSync(path.join(target, "index.js"))) target = path.join(target, "index.js");
    }
    return nextResolve(pathToFileURL(target).href, context);
  }
  return nextResolve(specifier, context);
}
