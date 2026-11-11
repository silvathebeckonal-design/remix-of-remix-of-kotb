// LZ4 block-format decompressor (UnityFS uses raw LZ4/LZ4HC blocks without frame headers).
export function lz4DecompressBlock(src: Uint8Array, outSize: number): Uint8Array {
  const dst = new Uint8Array(outSize);
  let s = 0;
  let d = 0;
  while (s < src.length) {
    const token = src[s++]!;
    let lit = token >>> 4;
    if (lit === 15) {
      let b: number;
      do {
        b = src[s++]!;
        lit += b;
      } while (b === 255);
    }
    if (d + lit > outSize) throw new Error("LZ4: literal overflow");
    dst.set(src.subarray(s, s + lit), d);
    s += lit;
    d += lit;
    if (s >= src.length) break; // last sequence carries literals only
    const offset = src[s]! | (src[s + 1]! << 8);
    s += 2;
    if (offset === 0 || offset > d) throw new Error("LZ4: bad match offset");
    let len = token & 15;
    if (len === 15) {
      let b: number;
      do {
        b = src[s++]!;
        len += b;
      } while (b === 255);
    }
    len += 4;
    if (d + len > outSize) throw new Error("LZ4: match overflow");
    let m = d - offset;
    for (let i = 0; i < len; i++) dst[d++] = dst[m++]!;
  }
  if (d !== outSize) throw new Error(`LZ4: expected ${outSize} bytes, got ${d}`);
  return dst;
}
