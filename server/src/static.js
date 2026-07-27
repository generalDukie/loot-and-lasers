import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve built client directory (repo root /dist in Docker, ../../dist locally). */
export function resolveStaticDir() {
  if (process.env.STATIC_DIR) return path.resolve(process.env.STATIC_DIR);
  return path.resolve(__dirname, "../../dist");
}

/** Serve Vite build + SPA fallback. Returns false when dist/ is missing. */
export function attachStaticApp(app) {
  if (process.env.SERVE_STATIC === "false") return false;

  const staticDir = resolveStaticDir();
  const indexHtml = path.join(staticDir, "index.html");
  if (!fs.existsSync(indexHtml)) return false;

  app.use(express.static(staticDir, { index: false, maxAge: "1h" }));

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const p = req.path;
    if (p.startsWith("/api") || p === "/health" || p.startsWith("/ws")) return next();
    res.sendFile(indexHtml);
  });

  return true;
}
