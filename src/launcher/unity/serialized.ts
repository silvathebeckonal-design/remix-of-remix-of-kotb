// Unity SerializedFile parser (format 22, Unity 2022.3): header, type table, object table and
// external references. Object payloads are read on demand by class-specific readers.
import { BinaryReader } from "./binary";

export const CLASS = {
  Texture2D: 28,
  AudioClip: 83,
  MonoBehaviour: 114,
  Sprite: 213,
} as const;

export interface SerializedType {
  classId: number;
  stripped: boolean;
  scriptTypeIndex: number;
}

export interface ObjectInfo {
  pathId: bigint;
  byteStart: number;
  byteSize: number;
  classId: number;
}

export interface SerializedFile {
  name: string;
  formatVersion: number;
  unityVersion: string;
  platform: number;
  typeTreeEnabled: boolean;
  types: SerializedType[];
  objects: ObjectInfo[];
  externals: string[];
  bytes: Uint8Array;
  little: boolean;
}

/** Quick sniff: SerializedFiles carry their engine version string right after the 48-byte header. */
export function looksLikeSerializedFile(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 64) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, 16).getUint32(8, false);
  return v >= 9 && v <= 30;
}

export function parseSerializedFile(name: string, bytes: Uint8Array): SerializedFile {
  const head = new BinaryReader(bytes, false);
  head.u32(); // legacy metadata size
  head.u32(); // legacy file size
  const formatVersion = head.u32();
  head.u32(); // legacy data offset
  if (formatVersion < 22) {
    throw new Error(`${name}: serialized format ${formatVersion} is older than this launcher supports`);
  }
  const little = head.u8() === 0;
  head.skip(3);
  head.u32(); // metadata size
  const fileSize = head.i64();
  const dataOffset = head.i64();
  head.i64(); // unknown / reserved
  if (fileSize > bytes.byteLength) {
    throw new Error(`${name} is truncated (${bytes.byteLength} of ${fileSize} bytes)`);
  }

  const r = new BinaryReader(bytes, little, head.pos);
  const unityVersion = r.cstring();
  const platform = r.i32();
  const typeTreeEnabled = r.bool();

  const readType = (isRef: boolean): SerializedType => {
    const classId = r.i32();
    const stripped = r.bool();
    const scriptTypeIndex = r.i16();
    if ((isRef && scriptTypeIndex >= 0) || classId === CLASS.MonoBehaviour) r.skip(16);
    r.skip(16); // old type hash
    if (typeTreeEnabled) {
      // Embedded type tree blob: 32-byte nodes + string buffer (+ dependency list). The launcher
      // carries its own 2022.3 layouts, so the blob is skipped rather than interpreted.
      const nodeCount = r.i32();
      const stringSize = r.i32();
      r.skip(nodeCount * 32 + stringSize);
      if (isRef) {
        r.cstring();
        r.cstring();
        r.cstring();
      } else {
        const deps = r.i32();
        r.skip(deps * 4);
      }
    }
    return { classId, stripped, scriptTypeIndex };
  };

  const typeCount = r.i32();
  const types: SerializedType[] = [];
  for (let i = 0; i < typeCount; i++) types.push(readType(false));

  const objectCount = r.i32();
  const objects: ObjectInfo[] = [];
  for (let i = 0; i < objectCount; i++) {
    r.align(4);
    const pathId = r.i64Big();
    const byteStart = r.i64() + dataOffset;
    const byteSize = r.u32();
    const typeIndex = r.i32();
    const t = types[typeIndex];
    objects.push({ pathId, byteStart, byteSize, classId: t ? t.classId : -1 });
  }

  const scriptCount = r.i32();
  for (let i = 0; i < scriptCount; i++) {
    r.i32();
    r.align(4);
    r.i64();
  }

  const externals: string[] = [];
  const externalCount = r.i32();
  for (let i = 0; i < externalCount; i++) {
    r.cstring();
    r.skip(16);
    r.i32();
    externals.push(r.cstring());
  }

  return {
    name,
    formatVersion,
    unityVersion,
    platform,
    typeTreeEnabled,
    types,
    objects,
    externals,
    bytes,
    little,
  };
}

export function objectReader(file: SerializedFile, obj: ObjectInfo): BinaryReader {
  const slice = file.bytes.subarray(obj.byteStart, obj.byteStart + obj.byteSize);
  return new BinaryReader(slice, file.little);
}
