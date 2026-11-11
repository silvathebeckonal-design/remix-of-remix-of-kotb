import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";

const webDir = resolve("dist/client");
const checkOnly = process.argv.includes("--check-assets");
if (!checkOnly) await stat(join(webDir, "index.html")).catch(() => {
  throw new Error("Build the app first (bun run build). Missing dist/client/index.html.");
});
const origin = process.env.ASSET_ORIGIN || "https://id-preview--c1a0df22-e1e9-42e8-a2ff-ca7d2f8905f4.lovable.app";
async function pointers(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await pointers(path));
    else if (entry.name.endsWith(".asset.json")) out.push(path);
  }
  return out;
}
for (const path of await pointers("src/assets")) {
  const asset = JSON.parse(await readFile(path, "utf8"));
  if (!asset.url.startsWith("/__l5e/assets-v1/")) throw new Error(`Unexpected asset URL in ${path}`);
  const response = await fetch(new URL(asset.url, origin));
  if (!response.ok) throw new Error(`Could not bundle ${path}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== asset.size) throw new Error(`Asset size mismatch: ${path}`);
  const temp = join(tmpdir(), "kotb-android-assets", asset.asset_id, asset.original_filename);
  const destination = join(webDir, asset.url.slice(1));
  await mkdir(dirname(temp), { recursive: true });
  await writeFile(temp, bytes);
  if (!checkOnly) {
    await mkdir(dirname(destination), { recursive: true });
    await cp(temp, destination);
  }
}
console.log(checkOnly ? "All offline asset sources downloaded and size-verified." : "All menu images, font, cursors and sounds are bundled for offline Android use.");