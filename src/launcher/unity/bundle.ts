// UnityFS asset bundle unpacker (bundle format 6-8): block table, LZ4/LZ4HC blocks, node directory.
import { BinaryReader } from "./binary";
import { lz4DecompressBlock } from "./lz4";

export interface BundleNode {
  path: string;
  data: Uint8Array;
}

export interface Bundle {
  unityRevision: string;
  compression: string;
  blockCount: number;
  nodes: BundleNode[];
}

const COMPRESSION = ["none", "LZMA", "LZ4", "LZ4HC"];

function inflate(kind: number, src: Uint8Array, size: number): Uint8Array {
  if (kind === 0) return src;
  if (kind === 2 || kind === 3) return lz4DecompressBlock(src, size);
  throw new Error(`${COMPRESSION[kind] ?? `type ${kind}`} compressed bundles are not supported`);
}

export function isUnityFS(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength > 8 &&
    bytes[0] === 0x55 && // U
    bytes[1] === 0x6e && // n
    bytes[2] === 0x69 && // i
    bytes[3] === 0x74 && // t
    bytes[4] === 0x79 && // y
    bytes[5] === 0x46 && // F
    bytes[6] === 0x53 // S
  );
}

export function parseBundle(bytes: Uint8Array): Bundle {
  const r = new BinaryReader(bytes, false);
  const sig = r.cstring();
  if (sig !== "UnityFS") throw new Error(`Not a UnityFS bundle (${sig})`);
  const version = r.u32();
  r.cstring(); // player version ("5.x.x")
  const unityRevision = r.cstring();
  r.i64(); // total size
  const compressedInfo = r.u32();
  const uncompressedInfo = r.u32();
  const flags = r.u32();
  if (version >= 7) r.align(16);

  const infoAtEnd = (flags & 0x80) !== 0;
  const infoStart = infoAtEnd ? bytes.byteLength - compressedInfo : r.pos;
  const infoRaw = bytes.subarray(infoStart, infoStart + compressedInfo);
  const info = new BinaryReader(inflate(flags & 0x3f, infoRaw, uncompressedInfo), false);
  if (!infoAtEnd) r.pos += compressedInfo;
  if (flags & 0x200) r.align(16);

  info.skip(16); // uncompressed data hash
  const blockCount = info.i32();
  const blocks: { u: number; c: number; flags: number }[] = [];
  let total = 0;
  for (let i = 0; i < blockCount; i++) {
    const u = info.u32();
    const c = info.u32();
    const f = info.u16();
    blocks.push({ u, c, flags: f });
    total += u;
  }
  const nodeCount = info.i32();
  const dir: { offset: number; size: number; path: string }[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const offset = info.i64();
    const size = info.i64();
    info.u32();
    dir.push({ offset, size, path: info.cstring() });
  }

  const data = new Uint8Array(total);
  let out = 0;
  let kinds = new Set<number>();
  for (const b of blocks) {
    const kind = b.flags & 0x3f;
    kinds.add(kind);
    data.set(inflate(kind, r.take(b.c), b.u), out);
    out += b.u;
  }
  if (kinds.size === 0) kinds = new Set([flags & 0x3f]);

  return {
    unityRevision,
    compression: [...kinds].map((k) => COMPRESSION[k] ?? `type ${k}`).join("+"),
    blockCount,
    nodes: dir.map((n) => ({ path: n.path, data: data.subarray(n.offset, n.offset + n.size) })),
  };
}
