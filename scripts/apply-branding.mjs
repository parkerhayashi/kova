#!/usr/bin/env node
/**
 * Unpack a branding zip from docs/branding/incoming/ and sort files into
 * docs/branding/{guide,assets,fonts}. Writes manifest.json for agents.
 *
 * Usage: npm run branding:apply
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const BRANDING = join(ROOT, "docs", "branding");
const INCOMING = join(BRANDING, "incoming");
const EXTRACTED = join(BRANDING, ".extracted");

const GUIDE_EXT = new Set([".pdf", ".md", ".txt", ".docx", ".html", ".htm"]);
const FONT_EXT = new Set([
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
]);
const IMAGE_EXT = new Set([
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".ico",
]);
const IGNORE_NAMES = new Set([
  "__macosx",
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
]);

function findZip() {
  if (!existsSync(INCOMING)) return null;
  const zips = readdirSync(INCOMING)
    .filter((f) => f.toLowerCase().endsWith(".zip"))
    .map((f) => join(INCOMING, f));
  return zips[0] ?? null;
}

function unzip(zipPath, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", dest], { stdio: "inherit" });
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORE_NAMES.has(name.toLowerCase())) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function bucket(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (GUIDE_EXT.has(ext)) return "guide";
  if (FONT_EXT.has(ext)) return "fonts";
  if (IMAGE_EXT.has(ext)) return "assets";
  return "assets";
}

function safeName(name) {
  return name.replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-");
}

function copySorted(files) {
  const dirs = ["guide", "assets", "fonts"];
  for (const d of dirs) {
    const p = join(BRANDING, d);
    rmSync(p, { recursive: true, force: true });
    mkdirSync(p, { recursive: true });
  }

  const manifest = {
    appliedAt: new Date().toISOString(),
    files: [],
  };

  const seen = new Map();

  for (const src of files) {
    const rel = relative(EXTRACTED, src);
    const parts = rel.split(/[/\\]/);
    if (parts.some((p) => IGNORE_NAMES.has(p.toLowerCase()))) continue;

    const bucketName = bucket(src);
    const base = safeName(basename(src));
    let destName = base;
    let n = 1;
    while (seen.has(`${bucketName}/${destName}`)) {
      const stem = base.replace(extname(base), "");
      destName = `${stem}-${n}${extname(base)}`;
      n++;
    }
    seen.set(`${bucketName}/${destName}`, true);

    const dest = join(BRANDING, bucketName, destName);
    cpSync(src, dest);
    manifest.files.push({
      bucket: bucketName,
      name: destName,
      source: rel,
      bytes: statSync(dest).size,
    });
  }

  return manifest;
}

function promotePublic(manifest) {
  const publicBrand = join(ROOT, "public", "brand");
  const publicIcons = join(ROOT, "public", "icons");
  mkdirSync(publicBrand, { recursive: true });
  mkdirSync(publicIcons, { recursive: true });

  const promoted = [];

  for (const file of manifest.files) {
    if (file.bucket !== "assets") continue;
    const src = join(BRANDING, "assets", file.name);
    const lower = file.name.toLowerCase();

    const isIcon =
      lower.includes("icon") ||
      lower.includes("app-icon") ||
      lower.includes("favicon") ||
      lower.includes("apple-touch") ||
      lower.includes("pwa");

    const isLogo =
      lower.includes("logo") ||
      lower.includes("wordmark") ||
      lower.includes("mark");

    if (isIcon) {
      const dest = join(publicIcons, file.name);
      cpSync(src, dest);
      promoted.push({ type: "icon", from: file.name, to: `public/icons/${file.name}` });
    } else if (isLogo) {
      const dest = join(publicBrand, file.name);
      cpSync(src, dest);
      promoted.push({ type: "logo", from: file.name, to: `public/brand/${file.name}` });
    }
  }

  manifest.promoted = promoted;
  return manifest;
}

function main() {
  const zip = findZip();
  if (!zip) {
    console.error(
      "No zip found. Drop a branding zip into docs/branding/incoming/ and re-run.",
    );
    process.exit(1);
  }

  console.log(`Unpacking ${basename(zip)} …`);
  unzip(zip, EXTRACTED);

  const files = walk(EXTRACTED);
  if (files.length === 0) {
    console.error("Zip was empty or contained no usable files.");
    process.exit(1);
  }

  const manifest = copySorted(files);
  promotePublic(manifest);

  writeFileSync(
    join(BRANDING, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  rmSync(EXTRACTED, { recursive: true, force: true });

  console.log("\nBranding unpacked:");
  console.log(`  guide/   ${manifest.files.filter((f) => f.bucket === "guide").length} files`);
  console.log(`  assets/  ${manifest.files.filter((f) => f.bucket === "assets").length} files`);
  console.log(`  fonts/   ${manifest.files.filter((f) => f.bucket === "fonts").length} files`);
  if (manifest.promoted?.length) {
    console.log(`  promoted ${manifest.promoted.length} file(s) to public/`);
  }
  console.log("\nNext: ask Cursor to apply tokens from docs/branding/guide/ into the app.");
  console.log("Inventory: docs/branding/manifest.json");
}

main();
