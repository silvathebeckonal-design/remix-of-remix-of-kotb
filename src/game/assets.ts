// Loading of the original textures from /assets and tinting (the game renders most
// sprites with an alpha-only "PixelArtWhite" material multiplied by a GlobalColor).
import { COLORS } from "./data";

/** Kept for callers that build paths; nothing is served from here - art comes from the player's files. */
export const ASSET_ROOT = "";

// The game ships with no art. The launcher decrypts the player's extracted pictures into memory
// and registers them here as blob URLs for this session only.
const vault = new Map<string, string>();
const keyOf = (p: string) => p.toLowerCase();
const base = (p: string) => keyOf(p.split("/").pop() ?? p);
const lang = (p: string) => (/english/i.test(p) ? "english" : /dutch/i.test(p) ? "dutch" : "");

export function registerVault(items: { path: string; blob: Blob }[]) {
  clearVault();
  for (const it of items) {
    const url = URL.createObjectURL(it.blob);
    vault.set(keyOf(it.path), url);
    const l = lang(it.path);
    if (l && !vault.has(`${l}|${base(it.path)}`)) vault.set(`${l}|${base(it.path)}`, url);
    if (!vault.has(`|${base(it.path)}`)) vault.set(`|${base(it.path)}`, url);
  }
}

export function clearVault() {
  for (const url of new Set(vault.values())) URL.revokeObjectURL(url);
  vault.clear();
}

const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

export const vaultSize = () => vault.size;

/** Resolves a game-relative path (e.g. "Texture2D/x.png") to the player's extracted picture. */
export function assetUrl(path: string): string {
  return vault.get(keyOf(path)) ?? vault.get(`${lang(path)}|${base(path)}`) ?? vault.get(`|${base(path)}`) ?? BLANK;
}

export const tex = (name: string) => assetUrl(`Texture2D/${name}.png`);

const images = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const done = images.get(src);
  if (done) return Promise.resolve(done);
  const p = pending.get(src);
  if (p) return p;
  const pr = new Promise<HTMLImageElement>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      images.set(src, img);
      resolve(img);
    };
    img.onerror = () => resolve(img);
    img.src = src;
  });
  pending.set(src, pr);
  return pr;
}

export function getImage(src: string): HTMLImageElement | undefined {
  const img = images.get(src);
  if (!img) void loadImage(src);
  return img && img.naturalWidth > 0 ? img : undefined;
}

export type Rgb = [number, number, number];

export function rgbOf(name: keyof typeof COLORS): Rgb {
  const c = COLORS[name];
  return [c[0], c[1], c[2]];
}

export function cssColor(c: readonly number[], a = 1): string {
  return `rgba(${Math.round((c[0] ?? 0) * 255)}, ${Math.round((c[1] ?? 0) * 255)}, ${Math.round((c[2] ?? 0) * 255)}, ${a})`;
}

const tinted = new Map<string, HTMLCanvasElement>();

/** Alpha mask of the sprite filled with `color`. */
export function getTinted(src: string, color: Rgb): HTMLCanvasElement | undefined {
  const key = src + "|" + color.join(",");
  const hit = tinted.get(key);
  if (hit) return hit;
  const img = getImage(src);
  if (!img) return undefined;
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = cssColor(color);
  ctx.fillRect(0, 0, c.width, c.height);
  tinted.set(key, c);
  return c;
}

export const range = (prefix: string, from: number, to: number) => {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(prefix + i);
  return out;
};

export const SPRITES = {
  trollIdleOutline: range("troll_chesspiece_idle", 1, 18),
  trollIdleFill: range("troll_chesspiece_idle_fill", 1, 18),
  trollRotoFill: range("troll_roto_idle_fill", 1, 19),
  trollRotoOutline: range("troll_roto_idle_outline", 1, 19),
  trollSpeakOutline: range("troll_speak_outline", 1, 4),
  kingShatter: range("king_shatter", 1, 5),
  landmineExplode: range("landmine_explode", 1, 5),
  bookFlip: range("book_flip", 1, 4),
  bookFlipOutline: range("book_flip_outline", 1, 4),
};

export function preloadAll(extra: string[] = []): Promise<unknown> {
  const names = new Set<string>([
    "board_tile",
    "slippery_tile_v2",
    "bridge_floor_1",
    "bridge_floor_2",
    "bridge_floor_down_1",
    "bridge_floor_down_2",
    "bridge_floor_left_1",
    "bridge_floor_left_2",
    "bridge_floor_right_1",
    "bridge_floor_right_2",
    "bridge_rocks_left",
    "bridge_rocks_right",
    "bridge_wall_1",
    "bridge_wall_2",
    "bridge_wall_3",
    "lillypad_1",
    "lillypad_2",
    "lillypad_3",
    "book_backdrop",
    "book_icon",
    "book_icon_outline",
    "book_divider",
    "book_page_highlight",
    "bookflipcorner_left",
    "bookflipcorner_right",
    "rulebook_arrow",
    "table_of_contents_icon",
    "troll_speak_fill1",
    "halo_fill",
    "halo_outline",
    "fog_cloud",
    "sleepyZ",
    "Square",
    "leaf",
    ...range("player_idle", 1, 4),
    ...["up", "down", "left", "right"].flatMap((d) => range(`player_move_${d}`, 1, 4)),
    ...Array.from({ length: 8 }, (_, i) => `chesspieces_fill${i + 1}`),
    ...Array.from({ length: 8 }, (_, i) => `chesspieces_outline${i + 1}`),
    ...Object.values(SPRITES).flat(),
  ]);
  return Promise.all([...[...names].map((n) => loadImage(tex(n))), ...extra.map((s) => loadImage(s))]);
}
