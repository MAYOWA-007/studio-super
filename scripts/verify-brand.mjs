import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const pngSignature = "89504e470d0a1a0a";

const assets = [
  ["studio-super-wordmark.png", 869, 275, 6],
  ["studio-super-wordmark-light.png", 869, 275, 6],
  ["studio-super-mark-16.png", 16, 16, 6],
  ["studio-super-mark-32.png", 32, 32, 6],
  ["studio-super-mark-64.png", 64, 64, 6],
  ["studio-super-mark-180.png", 180, 180, 6],
  ["studio-super-mark-512.png", 512, 512, 6],
  ["studio-super-mark-1024.png", 1024, 1024, 6],
  ["studio-super-mark-ios-1024.png", 1024, 1024, 2]
];

const generatedSources = [
  ["studio-super-wordmark-generated-v2.png", 2172, 724, 2],
  ["studio-super-wordmark-cutout-v2-final.png", 2172, 724, 6],
  ["studio-super-wordmark-light-generated-v2.png", 2179, 721, 2],
  ["studio-super-wordmark-light-cutout-v2-final.png", 2179, 721, 6],
  ["studio-super-mark-generated-v2.png", 1254, 1254, 2],
  ["studio-super-mark-cutout-v2-final.png", 1254, 1254, 6]
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

for (const [name, expectedWidth, expectedHeight, expectedColorType] of assets) {
  const source = await readFile(join(root, "public", "brand", name));
  assert(source.subarray(0, 8).toString("hex") === pngSignature, `${name}: invalid PNG signature`);
  assert(source.readUInt32BE(16) === expectedWidth, `${name}: expected width ${expectedWidth}`);
  assert(source.readUInt32BE(20) === expectedHeight, `${name}: expected height ${expectedHeight}`);
  assert(source[25] === expectedColorType, `${name}: expected PNG color type ${expectedColorType}`);

  const built = await readFile(join(root, "docs", "brand", name));
  assert(sha256(source) === sha256(built), `${name}: built copy does not match source`);
}

for (const [name, expectedWidth, expectedHeight, expectedColorType] of generatedSources) {
  const source = await readFile(join(root, "brand-source", name));
  assert(source.subarray(0, 8).toString("hex") === pngSignature, `${name}: invalid PNG signature`);
  assert(source.readUInt32BE(16) === expectedWidth, `${name}: expected width ${expectedWidth}`);
  assert(source.readUInt32BE(20) === expectedHeight, `${name}: expected height ${expectedHeight}`);
  assert(source[25] === expectedColorType, `${name}: expected PNG color type ${expectedColorType}`);
}

const html = await readFile(join(root, "index.html"), "utf8");
assert(html.includes("./manifest.webmanifest"), "index.html: manifest link missing");
assert(html.includes("./brand/studio-super-mark-32.png"), "index.html: 32 px favicon missing");
assert(html.includes("./brand/studio-super-mark-16.png"), "index.html: 16 px favicon missing");
assert(html.includes("./brand/studio-super-mark-180.png"), "index.html: Apple touch icon missing");
assert(!html.includes("data:image/svg+xml"), "index.html: coded SVG favicon is still present");

const appSource = await readFile(join(root, "src", "App.tsx"), "utf8");
assert(appSource.includes("studio-super-wordmark-light.png"), "App.tsx: light-interface wordmark missing");
assert(!appSource.includes("data:image/svg+xml"), "App.tsx: coded SVG brand artwork is present");

const manifest = JSON.parse(await readFile(join(root, "public", "manifest.webmanifest"), "utf8"));
assert(manifest.name === "Studio Super", "manifest: full product name missing");
assert(manifest.icons.some((icon) => icon.src === "brand/studio-super-mark-512.png"), "manifest: web icon missing");
assert(manifest.icons.some((icon) => icon.src === "brand/studio-super-mark-ios-1024.png"), "manifest: iOS package missing");

console.log(
  `Studio Super brand verification passed (${generatedSources.length} protected generations/masters, ${assets.length} shipping assets).`
);
