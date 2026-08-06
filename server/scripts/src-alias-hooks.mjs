/**
 * Custom resolve hook for `@/` → project `src/`, and extensionless relative imports.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function withJsExtension(target) {
  if (path.extname(target)) return target;
  if (fs.existsSync(target + ".js")) return target + ".js";
  if (fs.existsSync(target + ".jsx")) return target + ".jsx";
  if (fs.existsSync(path.join(target, "index.js"))) return path.join(target, "index.js");
  return target;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const target = withJsExtension(path.join(root, "src", rel));
    return nextResolve(pathToFileURL(target).href, context);
  }

  // Node ESM requires explicit extensions; Vite allows extensionless relatives.
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !path.extname(specifier) &&
    context.parentURL
  ) {
    const parentPath = fileURLToPath(context.parentURL);
    const target = withJsExtension(path.resolve(path.dirname(parentPath), specifier));
    if (fs.existsSync(target)) {
      return nextResolve(pathToFileURL(target).href, context);
    }
  }

  return nextResolve(specifier, context);
}
