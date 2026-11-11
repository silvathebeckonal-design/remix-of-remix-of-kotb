// Which game files the launcher reads, and how picked files map onto them.

/** Folder the player picks inside their King of the Bridge install. */
export const DATA_FOLDER = "King of the Bridge_Data";
export const GAME_TITLE = "King of the Bridge";
/** build-guid from boot.config of the version this launcher was made against. */
export const KNOWN_BUILD_GUID = "4320eddc97dd41818ba76d932644bc36";

/** Files that hold the game's pictures (Texture2D objects and their streamed pixel data). */
export const TEXTURE_SOURCES = [
  "globalgamemanagers.assets",
  "globalgamemanagers.assets.resS",
  "resources.assets",
  "resources.assets.resS",
  "sharedassets0.assets",
  "sharedassets0.assets.resS",
  "sharedassets1.assets",
  "sharedassets1.assets.resS",
  "sharedassets2.assets",
  "sharedassets2.assets.resS",
  "sharedassets3.assets",
  "sharedassets4.assets",
  "sharedassets4.assets.resS",
  "sharedassets5.assets",
  "sharedassets5.assets.resS",
] as const;

/** Rulebook pages live in two Addressables bundles under StreamingAssets/aa/StandaloneWindows64. */
export const PAGE_BUNDLES = [
  "localization-assets-english(en)_assets_all.bundle",
  "localization-assets-dutch(nl)_assets_all.bundle",
] as const;

export const EXPECTED_FILES: readonly string[] = ["app.info", ...TEXTURE_SOURCES, ...PAGE_BUNDLES];

export type FileKind = "appinfo" | "bootconfig" | "assets" | "ress" | "bundle" | "zip" | "ignored";

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

export function classifyFile(path: string): FileKind {
  const name = baseName(path);
  const lower = name.toLowerCase();
  if (lower === "app.info") return "appinfo";
  if (lower === "boot.config") return "bootconfig";
  if (/\.(zip|tar|tar\.gz|tgz)$/.test(lower)) return "zip";
  // Engine built-ins under Resources/ ("unity default resources") are not game art.
  if (/(^|[\\/])resources[\\/]unity/i.test(path)) return "ignored";
  if (lower.endsWith(".assets.ress")) return "ress";
  if (lower.endsWith(".assets")) return "assets";
  if (lower.endsWith(".bundle")) return "bundle";
  return "ignored";
}

/** Where an extracted texture is filed, based on the game file it came from. */
export function groupFor(sourceName: string): { group: string; folder: string } {
  const lower = sourceName.toLowerCase();
  if (lower.startsWith("localization-assets-english")) return { group: "Rulebook (English)", folder: "Rulebook/english" };
  if (lower.startsWith("localization-assets-dutch")) return { group: "Rulebook (Dutch)", folder: "Rulebook/dutch" };
  if (lower.endsWith(".bundle")) {
    const stem = sourceName.replace(/_assets_all\.bundle$/i, "").replace(/\.bundle$/i, "");
    return { group: stem, folder: `Bundles/${stem}` };
  }
  return { group: "Sprites", folder: "Texture2D" };
}

/** Unique file name per folder: the second "x" becomes "x_0", then "x_1"... */
export function uniquePath(used: Set<string>, folder: string, name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, "_").trim() || "unnamed";
  let path = `${folder}/${safe}.png`;
  for (let k = 0; used.has(path); k++) path = `${folder}/${safe}_${k}.png`;
  used.add(path);
  return path;
}

/** Reads app.info ("company\nproduct") and checks it is this game. */
export function checkAppInfo(text: string): { ok: boolean; product: string; company: string } {
  const [company = "", product = ""] = text.split(/\r?\n/).map((l) => l.trim());
  return { ok: product.toLowerCase() === GAME_TITLE.toLowerCase(), product, company };
}

export function readBuildGuid(bootConfig: string): string | null {
  const m = /build-guid=([0-9a-f]+)/i.exec(bootConfig);
  return m ? m[1]!.toLowerCase() : null;
}

/** An archive is accepted when at least this share of EXPECTED_FILES is present. */
export const MIN_MATCH_RATIO = 0.75;

export function archiveMatches(present: number, total = EXPECTED_FILES.length): boolean {
  return total > 0 && present / total >= MIN_MATCH_RATIO - 1e-9;
}
