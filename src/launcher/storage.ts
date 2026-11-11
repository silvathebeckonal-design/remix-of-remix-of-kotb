// Offline store for extracted pictures (IndexedDB; usable from the page and the worker).
const DB_NAME = "kotb-launcher";
const DB_VERSION = 1;

export interface StoredAsset {
  path: string;
  name: string;
  group: string;
  source: string;
  width: number;
  height: number;
  format: string;
  blob: Blob;
}

export interface Manifest {
  extractedAt: number;
  count: number;
  groups: Record<string, number>;
  build: string | null;
  skipped: number;
  missing: string[];
  warnings: string[];
  bytesWritten: number;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

let dbp: Promise<IDBDatabase> | null = null;
export function openDb(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets", { keyPath: "path" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => {
        dbp = null;
        rej(r.error);
      };
    });
  }
  return dbp;
}

async function store(name: "assets" | "meta", mode: IDBTransactionMode) {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function clearAll() {
  await req((await store("assets", "readwrite")).clear());
  const meta = await store("meta", "readwrite");
  await req(meta.delete("manifest"));
}

// Pictures are kept encrypted with a per-install key that the browser marks non-extractable,
// so the store holds no readable copy of the game's art; only this app can turn it back into images.
let keyp: Promise<CryptoKey> | null = null;
function vaultKey(): Promise<CryptoKey> {
  if (!keyp) {
    keyp = (async () => {
      const existing = (await req((await store("meta", "readonly")).get("vaultKey"))) as CryptoKey | undefined;
      if (existing) return existing;
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await req((await store("meta", "readwrite")).put(key, "vaultKey"));
      return key;
    })().catch((e) => {
      keyp = null;
      throw e;
    });
  }
  return keyp;
}

interface SealedAsset extends Omit<StoredAsset, "blob"> {
  iv: Uint8Array;
  sealed: ArrayBuffer;
}

export async function putAsset(a: StoredAsset) {
  const key = await vaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await a.blob.arrayBuffer());
  const { blob: _plain, ...meta } = a;
  void _plain;
  const row: SealedAsset = { ...meta, iv, sealed };
  await req((await store("assets", "readwrite")).put(row));
}

export async function putManifest(m: Manifest) {
  await req((await store("meta", "readwrite")).put(m, "manifest"));
}

export async function getManifest(): Promise<Manifest | null> {
  try {
    return ((await req((await store("meta", "readonly")).get("manifest"))) as Manifest | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Decrypts every stored picture for the game runtime (kept in memory only). */
export async function unsealAssets(): Promise<StoredAsset[]> {
  const rows = (await req((await store("assets", "readonly")).getAll())) as SealedAsset[];
  if (rows.length === 0) return [];
  const key = await vaultKey();
  const out: StoredAsset[] = [];
  for (const r of rows) {
    if (!r.sealed) continue;
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: r.iv as BufferSource }, key, r.sealed);
      const { iv: _iv, sealed: _s, ...meta } = r;
      void _iv;
      void _s;
      out.push({ ...meta, blob: new Blob([plain], { type: "image/png" }) });
    } catch {
      /* written under a different key: skip, a re-extract fixes it */
    }
  }
  return out;
}
