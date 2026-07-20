import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../docs/index.html", import.meta.url);
const html = await readFile(path, "utf8");
await writeFile(path, html.replace(/\r\n?/g, "\n"), "utf8");
