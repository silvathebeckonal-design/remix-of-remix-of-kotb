// Texture2D reader for the Unity 2022.3 layout (release builds strip type trees, so the field
// order is fixed here) plus pixel decoders for the formats King of the Bridge ships.
import type { BinaryReader } from "./binary";

export interface Texture2DInfo {
  name: string;
  width: number;
  height: number;
  format: number;
  mipCount: number;
  imageCount: number;
  inline: Uint8Array;
  stream: { offset: number; size: number; path: string } | null;
}

export const TEXTURE_FORMAT_NAMES: Record<number, string> = {
  1: "Alpha8",
  2: "ARGB4444",
  3: "RGB24",
  4: "RGBA32",
  5: "ARGB32",
  7: "RGB565",
  9: "R16",
  10: "DXT1",
  12: "DXT5",
  13: "RGBA4444",
  14: "BGRA32",
  62: "RG16",
  63: "R8",
};

export const formatName = (f: number) => TEXTURE_FORMAT_NAMES[f] ?? `format ${f}`;

export function readTexture2D(r: BinaryReader): Texture2DInfo {
  const name = r.alignedString();
  r.i32(); // m_ForcedFallbackFormat
  r.bool(); // m_DownscaleFallback
  r.bool(); // m_IsAlphaChannelOptional
  r.align(4);
  const width = r.i32();
  const height = r.i32();
  r.u32(); // m_CompleteImageSize
  r.i32(); // m_MipsStripped
  const format = r.i32();
  const mipCount = r.i32();
  r.bool(); // m_IsReadable
  r.bool(); // m_IsPreProcessed
  r.bool(); // m_IgnoreMipmapLimit
  r.align(4);
  r.alignedString(); // m_MipmapLimitGroupName
  r.bool(); // m_StreamingMipmaps
  r.align(4);
  r.i32(); // m_StreamingMipmapsPriority
  const imageCount = r.i32();
  r.i32(); // m_TextureDimension
  r.skip(24); // GLTextureSettings
  r.i32(); // m_LightmapFormat
  r.i32(); // m_ColorSpace
  const blob = r.i32();
  r.skip(blob);
  r.align(4);
  const inlineSize = r.i32();
  const inline = r.take(inlineSize);
  r.align(4);
  const offset = r.u64();
  const size = r.u32();
  const path = r.alignedString();
  return {
    name,
    width,
    height,
    format,
    mipCount,
    imageCount,
    inline,
    stream: size > 0 && path ? { offset, size, path } : null,
  };
}

/** Bytes occupied by the top mip level. */
export function mip0Size(format: number, w: number, h: number): number | null {
  const bw = Math.ceil(w / 4);
  const bh = Math.ceil(h / 4);
  switch (format) {
    case 1:
    case 63:
      return w * h;
    case 2:
    case 7:
    case 9:
    case 13:
    case 62:
      return w * h * 2;
    case 3:
      return w * h * 3;
    case 4:
    case 5:
    case 14:
      return w * h * 4;
    case 10:
      return bw * bh * 8;
    case 12:
      return bw * bh * 16;
    default:
      return null;
  }
}

export const isSupportedFormat = (f: number) => mip0Size(f, 4, 4) !== null;

function rgb565(c: number, out: Uint8Array, o: number) {
  const r = (c >> 11) & 31;
  const g = (c >> 5) & 63;
  const b = c & 31;
  out[o] = (r << 3) | (r >> 2);
  out[o + 1] = (g << 2) | (g >> 4);
  out[o + 2] = (b << 3) | (b >> 2);
}

function decodeDXT(src: Uint8Array, w: number, h: number, dxt5: boolean, out: Uint8Array) {
  const bw = Math.ceil(w / 4);
  const bh = Math.ceil(h / 4);
  const pal = new Uint8Array(16);
  const alpha = new Uint8Array(8);
  let s = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let aBits = 0n;
      if (dxt5) {
        const a0 = src[s]!;
        const a1 = src[s + 1]!;
        alpha[0] = a0;
        alpha[1] = a1;
        if (a0 > a1) for (let i = 1; i < 7; i++) alpha[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7);
        else {
          for (let i = 1; i < 5; i++) alpha[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5);
          alpha[6] = 0;
          alpha[7] = 255;
        }
        for (let i = 7; i >= 2; i--) aBits = (aBits << 8n) | BigInt(src[s + i]!);
        s += 8;
      }
      const c0 = src[s]! | (src[s + 1]! << 8);
      const c1 = src[s + 2]! | (src[s + 3]! << 8);
      rgb565(c0, pal, 0);
      rgb565(c1, pal, 4);
      pal[3] = 255;
      pal[7] = 255;
      if (c0 > c1 || dxt5) {
        for (let k = 0; k < 3; k++) {
          pal[8 + k] = Math.round((2 * pal[k]! + pal[4 + k]!) / 3);
          pal[12 + k] = Math.round((pal[k]! + 2 * pal[4 + k]!) / 3);
        }
        pal[11] = 255;
        pal[15] = 255;
      } else {
        for (let k = 0; k < 3; k++) pal[8 + k] = Math.round((pal[k]! + pal[4 + k]!) / 2);
        pal[11] = 255;
        pal[12] = pal[13] = pal[14] = pal[15] = 0;
      }
      const bits = (src[s + 4]! | (src[s + 5]! << 8) | (src[s + 6]! << 16) | (src[s + 7]! << 24)) >>> 0;
      s += 8;
      for (let i = 0; i < 16; i++) {
        const x = bx * 4 + (i & 3);
        const y = by * 4 + (i >> 2);
        if (x >= w || y >= h) continue;
        const idx = (bits >>> (i * 2)) & 3;
        const o = (y * w + x) * 4;
        out[o] = pal[idx * 4]!;
        out[o + 1] = pal[idx * 4 + 1]!;
        out[o + 2] = pal[idx * 4 + 2]!;
        out[o + 3] = dxt5 ? alpha[Number((aBits >> BigInt(i * 3)) & 7n)]! : pal[idx * 4 + 3]!;
      }
    }
  }
}

/**
 * Decode the top mip into straight RGBA, top row first (Unity stores rows bottom-up).
 * Returns null for formats this launcher does not decode.
 */
export function decodeTexture(format: number, w: number, h: number, src: Uint8Array): Uint8Array | null {
  const need = mip0Size(format, w, h);
  if (need === null) return null;
  if (src.byteLength < need) throw new Error(`Image data too short (${src.byteLength} < ${need} bytes)`);
  const out = new Uint8Array(w * h * 4);
  const n = w * h;
  switch (format) {
    case 1: // Alpha8: white with alpha
      for (let i = 0; i < n; i++) {
        out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255;
        out[i * 4 + 3] = src[i]!;
      }
      break;
    case 63: // R8
      for (let i = 0; i < n; i++) {
        out[i * 4] = src[i]!;
        out[i * 4 + 3] = 255;
      }
      break;
    case 2: // ARGB4444 (little-endian u16: A in the high nibble, B in the low)
      for (let i = 0; i < n; i++) {
        const v = src[i * 2]! | (src[i * 2 + 1]! << 8);
        out[i * 4] = ((v >> 8) & 15) * 17;
        out[i * 4 + 1] = ((v >> 4) & 15) * 17;
        out[i * 4 + 2] = (v & 15) * 17;
        out[i * 4 + 3] = ((v >> 12) & 15) * 17;
      }
      break;
    case 13: // RGBA4444
      for (let i = 0; i < n; i++) {
        const v = src[i * 2]! | (src[i * 2 + 1]! << 8);
        out[i * 4] = ((v >> 12) & 15) * 17;
        out[i * 4 + 1] = ((v >> 8) & 15) * 17;
        out[i * 4 + 2] = ((v >> 4) & 15) * 17;
        out[i * 4 + 3] = (v & 15) * 17;
      }
      break;
    case 7: // RGB565
      for (let i = 0; i < n; i++) {
        rgb565(src[i * 2]! | (src[i * 2 + 1]! << 8), out, i * 4);
        out[i * 4 + 3] = 255;
      }
      break;
    case 9: // R16
      for (let i = 0; i < n; i++) {
        out[i * 4] = src[i * 2 + 1]!;
        out[i * 4 + 3] = 255;
      }
      break;
    case 62: // RG16
      for (let i = 0; i < n; i++) {
        out[i * 4] = src[i * 2]!;
        out[i * 4 + 1] = src[i * 2 + 1]!;
        out[i * 4 + 3] = 255;
      }
      break;
    case 3: // RGB24
      for (let i = 0; i < n; i++) {
        out[i * 4] = src[i * 3]!;
        out[i * 4 + 1] = src[i * 3 + 1]!;
        out[i * 4 + 2] = src[i * 3 + 2]!;
        out[i * 4 + 3] = 255;
      }
      break;
    case 4: // RGBA32
      out.set(src.subarray(0, need));
      break;
    case 5: // ARGB32
      for (let i = 0; i < n; i++) {
        out[i * 4] = src[i * 4 + 1]!;
        out[i * 4 + 1] = src[i * 4 + 2]!;
        out[i * 4 + 2] = src[i * 4 + 3]!;
        out[i * 4 + 3] = src[i * 4]!;
      }
      break;
    case 14: // BGRA32
      for (let i = 0; i < n; i++) {
        out[i * 4] = src[i * 4 + 2]!;
        out[i * 4 + 1] = src[i * 4 + 1]!;
        out[i * 4 + 2] = src[i * 4]!;
        out[i * 4 + 3] = src[i * 4 + 3]!;
      }
      break;
    case 10:
      decodeDXT(src, w, h, false, out);
      break;
    case 12:
      decodeDXT(src, w, h, true, out);
      break;
    default:
      return null;
  }
  return flipRows(out, w, h);
}

export function flipRows(px: Uint8Array, w: number, h: number): Uint8Array {
  const stride = w * 4;
  const tmp = new Uint8Array(stride);
  for (let y = 0; y < h >> 1; y++) {
    const a = y * stride;
    const b = (h - 1 - y) * stride;
    tmp.set(px.subarray(a, a + stride));
    px.copyWithin(a, b, b + stride);
    px.set(tmp, b);
  }
  return px;
}
