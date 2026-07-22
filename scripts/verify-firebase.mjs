import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "docs");
const origin = (process.env.STUDIO_SUPER_FIREBASE_ORIGIN || "https://knight-studio-super.web.app").replace(/\/$/, "");
const files = await collect(publicRoot);
let verifiedBytes = 0;

for (const absolutePath of files) {
  const relativePath = path.relative(publicRoot, absolutePath).replaceAll(path.sep, "/");
  if (relativePath === ".nojekyll") continue;
  const local = await readFile(absolutePath);
  const response = await fetch(`${origin}/${relativePath}`, { cache: "no-store" });
  assert.equal(response.status, 200, `${relativePath} returned ${response.status}`);
  const remote = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash("sha256").update(remote).digest("hex"), createHash("sha256").update(local).digest("hex"), `${relativePath} does not match the built release`);
  verifiedBytes += remote.byteLength;
}

for (const forbidden of ["/package.json", "/src/App.tsx", "/firebase.json", "/README.md"]) {
  const response = await fetch(`${origin}${forbidden}`, { cache: "no-store", redirect: "manual" });
  assert.equal(response.status, 404, `${forbidden} must not be public`);
}

const rootResponse = await fetch(`${origin}/`, { cache: "no-store" });
assert.equal(rootResponse.status, 200);
assert.match(await rootResponse.text(), /<title>Studio Super<\/title>/);

console.log(JSON.stringify({
  verificationLevel: "live-static-parity",
  origin,
  verifiedFiles: files.filter((file) => path.basename(file) !== ".nojekyll").length,
  verifiedBytes,
  forbiddenPaths: 4
}, null, 2));

async function collect(directory) {
  const discovered = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) discovered.push(...await collect(absolute));
    else if (entry.isFile()) discovered.push(absolute);
  }
  return discovered.sort();
}
