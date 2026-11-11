// Extraction pipeline: verify -> unpack -> read object tables -> decode every Texture2D -> PNG.
// Runs anywhere (worker or tests): callers supply the files and receive progress + PNGs.
import { gunzipSync, unzipSync } from "fflate";
import { parseBundle, isUnityFS } from "./unity/bundle";
import { CLASS, objectReader, parseSerializedFile, type ObjectInfo, type SerializedFile } from "./unity/serialized";
import { decodeTexture, formatName, mip0Size, readTexture2D } from "./unity/texture2d";
import { encodePNG } from "./unity/png";
import {
  EXPECTED_FILES,
  archiveMatches,
  KNOWN_BUILD_GUID,
  baseName,
  checkAppInfo,
  classifyFile,
  groupFor,
  readBuildGuid,
  uniquePath,
} from "./files";

export interface InputFile {
  path: string;
  size: number;
  read(): Promise<Uint8Array>;
}

export interface ProgressEvent {
  /** 0..1 of the whole job */
  progress: number;
  phase: "verify" | "unpack" | "scan" | "decode" | "save" | "done";
  text: string;
}

export interface ExtractedAsset {
  path: string;
  name: string;
  group: string;
  source: string;
  width: number;
  height: number;
  format: string;
  png: Uint8Array;
}

export interface ExtractSummary {
  count: number;
  groups: Record<string, number>;
  skipped: { name: string; reason: string }[];
  warnings: string[];
  missing: string[];
  build: string | null;
  bytesRead: number;
  bytesWritten: number;
  ms: number;
}

export class ExtractError extends Error {}

interface Container {
  name: string;
  file: SerializedFile;
  /** streamed data blobs reachable from this container, keyed by StreamingInfo.path */
  resolve(path: string): Promise<Uint8Array | null>;
}

const enc = new TextDecoder();

export async function extractGameAssets(
  input: InputFile[],
  onProgress: (e: ProgressEvent) => void,
  onAsset: (a: ExtractedAsset) => Promise<void> | void,
): Promise<ExtractSummary> {
  const t0 = Date.now();
  const warnings: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  let bytesRead = 0;
  let bytesWritten = 0;
  const emit = (progress: number, phase: ProgressEvent["phase"], text: string) =>
    onProgress({ progress: Math.max(0, Math.min(1, progress)), phase, text });

  // ---- 1. Expand any .zip the player picked into virtual files ----------------------------
  emit(0, "verify", "Looking through the selected files...");
  let files: InputFile[] = [];
  const zips = input.filter((f) => classifyFile(f.path) === "zip");
  for (const f of input) if (classifyFile(f.path) !== "zip") files.push(f);
  for (let i = 0; i < zips.length; i++) {
    const z = zips[i]!;
    emit(0.01 * (i / zips.length), "unpack", `Unpacking ${baseName(z.path)}...`);
    const raw = await z.read();
    bytesRead += raw.byteLength;
    const entries = unpackArchive(z.path, raw);
    for (const [name, data] of Object.entries(entries)) {
      if (name.split("/").some((p) => p === "__MACOSX")) continue;
      files.push({ path: name, size: data.byteLength, read: async () => data });
    }
  }
  files = files.filter((f) => classifyFile(f.path) !== "ignored");

  // De-duplicate by base name (a folder and a zip of it could both be picked).
  const byName = new Map<string, InputFile>();
  for (const f of files) {
    const key = baseName(f.path).toLowerCase();
    if (!byName.has(key)) byName.set(key, f);
  }
  const get = (name: string) => byName.get(name.toLowerCase());

  // ---- 2. Verify it is King of the Bridge --------------------------------------------------
  emit(0.015, "verify", "Checking app.info...");
  const appInfo = get("app.info");
  if (appInfo) {
    const info = checkAppInfo(enc.decode(await appInfo.read()));
    if (!info.ok) {
      throw new ExtractError(
        `These files belong to "${info.product || "another game"}", not King of the Bridge.`,
      );
    }
  } else {
    warnings.push("app.info was not selected, so the game could not be verified.");
  }
  let build: string | null = null;
  const boot = get("boot.config");
  if (boot) {
    build = readBuildGuid(enc.decode(await boot.read()));
    if (build && build !== KNOWN_BUILD_GUID) {
      warnings.push(`Different game build (${build.slice(0, 8)}). Extraction may skip some pictures.`);
    }
  }

  const assetFiles = [...byName.values()].filter((f) => classifyFile(f.path) === "assets");
  const bundleFiles = [...byName.values()].filter((f) => classifyFile(f.path) === "bundle");
  if (assetFiles.length === 0 && bundleFiles.length === 0) {
    throw new ExtractError(
      "No game data found. Select the \"King of the Bridge_Data\" folder from your game install.",
    );
  }
  const missing = EXPECTED_FILES.filter((n) => !get(n));
  if (!archiveMatches(EXPECTED_FILES.length - missing.length)) {
    throw new ExtractError(
      `This doesn't look like King of the Bridge: only ${EXPECTED_FILES.length - missing.length} of ${EXPECTED_FILES.length} expected game files were found.`,
    );
  }
  if (missing.length) warnings.push(`Missing ${missing.length} game file(s): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`);
  emit(0.02, "verify", `Found ${assetFiles.length} asset files and ${bundleFiles.length} bundles`);

  // ---- 3. Read object tables ---------------------------------------------------------------
  const scanTotal = [...assetFiles, ...bundleFiles].reduce((n, f) => n + f.size, 0) || 1;
  let scanned = 0;
  const scanP = () => 0.02 + 0.13 * (scanned / scanTotal);
  const containers: Container[] = [];
  const ressCache = new Map<string, Promise<Uint8Array | null>>();
  const loadRess = (name: string) => {
    const key = baseName(name).toLowerCase();
    let p = ressCache.get(key);
    if (!p) {
      const f = byName.get(key);
      p = f
        ? f.read().then((b) => {
            bytesRead += b.byteLength;
            return b;
          })
        : Promise.resolve(null);
      ressCache.set(key, p);
    }
    return p;
  };

  for (const f of assetFiles) {
    const name = baseName(f.path);
    emit(scanP(), "scan", `Reading object table of ${name}...`);
    const bytes = await f.read();
    bytesRead += bytes.byteLength;
    try {
      const file = parseSerializedFile(name, bytes);
      containers.push({ name, file, resolve: (p) => loadRess(p) });
      const tex = file.objects.filter((o) => o.classId === CLASS.Texture2D).length;
      scanned += f.size;
      emit(scanP(), "scan", `${name}: ${file.objects.length} objects, ${tex} textures (Unity ${file.unityVersion})`);
    } catch (e) {
      scanned += f.size;
      warnings.push(`${name} could not be read: ${(e as Error).message}`);
    }
  }

  for (const f of bundleFiles) {
    const name = baseName(f.path);
    emit(scanP(), "unpack", `Unpacking ${name}...`);
    const bytes = await f.read();
    bytesRead += bytes.byteLength;
    if (!isUnityFS(bytes)) {
      scanned += f.size;
      warnings.push(`${name} is not a Unity bundle.`);
      continue;
    }
    try {
      const bundle = parseBundle(bytes);
      const blobs = new Map<string, Uint8Array>();
      for (const n of bundle.nodes) blobs.set(n.path.toLowerCase(), n.data);
      const resolve = async (p: string) => {
        const m = /^archive:\/(?:[^/]+\/)?(.+)$/i.exec(p);
        const key = (m ? m[1]! : baseName(p)).toLowerCase();
        return blobs.get(key) ?? null;
      };
      let textures = 0;
      for (const n of bundle.nodes) {
        if (/\.(ress|resource)$/i.test(n.path)) continue;
        try {
          const file = parseSerializedFile(n.path, n.data);
          textures += file.objects.filter((o) => o.classId === CLASS.Texture2D).length;
          containers.push({ name, file, resolve });
        } catch (e) {
          warnings.push(`${name}/${n.path}: ${(e as Error).message}`);
        }
      }
      scanned += f.size;
      emit(
        scanP(),
        "unpack",
        `${name}: ${bundle.blockCount} ${bundle.compression} blocks, ${textures} textures`,
      );
    } catch (e) {
      scanned += f.size;
      warnings.push(`${name} could not be unpacked: ${(e as Error).message}`);
    }
  }

  // ---- 4. Decode every Texture2D ----------------------------------------------------------
  const jobs: { c: Container; obj: ObjectInfo }[] = [];
  for (const c of containers)
    for (const obj of c.file.objects) if (obj.classId === CLASS.Texture2D) jobs.push({ c, obj });
  if (jobs.length === 0) {
    throw new ExtractError("No pictures were found in the selected files.");
  }
  // Weight jobs by object size so the bar tracks real work (big sheets take longer).
  const weights = jobs.map((j) => 2048 + j.obj.byteSize);
  const totalW = weights.reduce((a, b) => a + b, 0);
  let doneW = 0;
  const decP = () => 0.15 + 0.83 * (doneW / totalW);
  const used = new Set<string>();
  const groups: Record<string, number> = {};
  let count = 0;

  for (let i = 0; i < jobs.length; i++) {
    const { c, obj } = jobs[i]!;
    try {
      const tex = readTexture2D(objectReader(c.file, obj));
      const fmt = formatName(tex.format);
      if (tex.width <= 0 || tex.height <= 0) {
        skipped.push({ name: tex.name || "unnamed", reason: "empty texture" });
        continue;
      }
      const need = mip0Size(tex.format, tex.width, tex.height);
      if (need === null) {
        skipped.push({ name: tex.name, reason: `${fmt} is not supported` });
        continue;
      }
      emit(decP(), "decode", `Decoding ${tex.name} - ${tex.width}x${tex.height} ${fmt}`);
      let data: Uint8Array | null = tex.inline.byteLength > 0 ? tex.inline : null;
      if (!data && tex.stream) {
        const blob = await c.resolve(tex.stream.path);
        if (!blob) {
          skipped.push({ name: tex.name, reason: `${baseName(tex.stream.path)} was not selected` });
          continue;
        }
        data = blob.subarray(tex.stream.offset, tex.stream.offset + tex.stream.size);
      }
      if (!data) {
        skipped.push({ name: tex.name, reason: "no pixel data" });
        continue;
      }
      const rgba = decodeTexture(tex.format, tex.width, tex.height, data);
      if (!rgba) {
        skipped.push({ name: tex.name, reason: `${fmt} is not supported` });
        continue;
      }
      const png = encodePNG(rgba, tex.width, tex.height);
      const { group, folder } = groupFor(c.name);
      const path = uniquePath(used, folder, tex.name);
      bytesWritten += png.byteLength;
      await onAsset({
        path,
        name: tex.name,
        group,
        source: c.name,
        width: tex.width,
        height: tex.height,
        format: fmt,
        png,
      });
      groups[group] = (groups[group] ?? 0) + 1;
      count++;
    } catch (e) {
      skipped.push({ name: `object ${obj.pathId} in ${c.name}`, reason: (e as Error).message });
    } finally {
      doneW += weights[i]!;
    }
  }

  emit(0.99, "save", `Saving ${count} pictures to this device...`);
  return {
    count,
    groups,
    skipped,
    warnings,
    missing,
    build,
    bytesRead,
    bytesWritten,
    ms: Date.now() - t0,
  };
}

/** Opens a .zip, .tar, .tar.gz or .tgz into { path: bytes }, keeping only files the extractor reads. */
export function unpackArchive(path: string, raw: Uint8Array): Record<string, Uint8Array> {
  const lower = path.toLowerCase();
  const keep = (name: string) => !name.endsWith("/") && classifyFile(name) !== "ignored";
  if (lower.endsWith(".zip")) return unzipSync(raw, { filter: (e) => keep(e.name) });
  const tar = lower.endsWith(".tar") ? raw : gunzipSync(raw);
  const out: Record<string, Uint8Array> = {};
  const dec = new TextDecoder();
  const str = (o: number, n: number) => dec.decode(tar.subarray(o, o + n)).replace(/\0.*$/s, "");
  let longName: string | null = null;
  let off = 0;
  while (off + 512 <= tar.length) {
    const name0 = str(off, 100);
    if (!name0) break;
    const size = parseInt(str(off + 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(tar[off + 156] || 48);
    const prefix = str(off + 345, 155);
    const body = off + 512;
    if (type === "L") {
      longName = dec.decode(tar.subarray(body, body + size)).replace(/\0.*$/s, "");
    } else {
      const name = longName ?? (prefix ? `${prefix}/${name0}` : name0);
      longName = null;
      if ((type === "0" || type === "\0") && keep(name)) out[name] = tar.slice(body, body + size);
    }
    off = body + Math.ceil(size / 512) * 512;
  }
  return out;
}
