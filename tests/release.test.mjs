import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const readText = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Firebase release is isolated on the dedicated Studio Super site", async () => {
  const config = JSON.parse(await readText("firebase.json"));
  assert.equal(config.hosting.site, "knight-studio-super");
  assert.equal(config.hosting.public, "docs");
  assert.equal(config.hosting.rewrites, undefined);
  const headers = config.hosting.headers.flatMap((entry) => entry.headers);
  assert(headers.some((entry) => entry.key === "Content-Security-Policy" && entry.value.includes("connect-src 'self'")));
  assert(headers.some((entry) => entry.key === "X-Frame-Options" && entry.value === "DENY"));
});

test("offline shell stays local and caches only same-origin files", async () => {
  const worker = await readText("public/sw.js");
  assert.match(worker, /studio-super-shell-20260722/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.doesNotMatch(worker, /supabase|vercel/i);
  const entry = await readText("src/main.tsx");
  assert.match(entry, /serviceWorker\.register\("\.\/sw\.js"/);
});

test("generated brand family includes web, favicon, and opaque iOS assets", async () => {
  const required = [
    "public/brand/studio-super-mark-16.png",
    "public/brand/studio-super-mark-180.png",
    "public/brand/studio-super-mark-512.png",
    "public/brand/studio-super-mark-ios-1024.png",
    "public/brand/studio-super-wordmark.png",
    "public/brand/studio-super-wordmark-light.png"
  ];
  for (const path of required) assert((await stat(new URL(`../${path}`, import.meta.url))).isFile(), `${path} is missing`);
  const index = await readText("index.html");
  assert.match(index, /studio-super-mark-180\.png/);
  assert.match(index, /manifest\.webmanifest/);
});

test("runtime source preserves the browser-only privacy contract", async () => {
  const source = [await readText("src/App.tsx"), await readText("src/storage.ts"), await readText("src/main.tsx")].join("\n");
  assert.doesNotMatch(source, /supabase|vercel|firebase|fetch\s*\(/i);
  assert.match(source, /localStorage/);
  assert.match(source, /BroadcastChannel/);
});

test("growth controls remain functional and locally persisted", async () => {
  const source = await readText("src/App.tsx");
  const controls = await readText("src/session-control.mjs");
  const styles = await readText("src/styles-v21-growth.css");
  assert.match(source, /SESSION_TEMPLATES/);
  assert.match(source, /requestMIDIAccess/);
  assert.match(source, /exportWorkspaceBackup/);
  assert.match(source, /visibilitychange/);
  assert.match(controls, /computeTimerProgress/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /forced-colors/);
  assert.doesNotMatch([source, controls].join("\n"), /https?:\/\/|fetch\s*\(/i);
});
