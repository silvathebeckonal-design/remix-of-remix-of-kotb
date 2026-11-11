// Little/big-endian cursor over an ArrayBuffer, with the alignment and string rules Unity's
// serializer uses (aligned strings = int32 length + bytes + pad to 4).
const utf8 = new TextDecoder("utf-8");

export class BinaryReader {
  readonly view: DataView;
  readonly bytes: Uint8Array;
  pos: number;
  little: boolean;

  constructor(buf: ArrayBuffer | Uint8Array, little = true, pos = 0) {
    this.bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.little = little;
    this.pos = pos;
  }

  get length() {
    return this.bytes.byteLength;
  }

  private need(n: number) {
    if (this.pos + n > this.bytes.byteLength) {
      throw new RangeError(`Read past end (${this.pos}+${n} > ${this.bytes.byteLength})`);
    }
  }

  u8() {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }
  bool() {
    return this.u8() !== 0;
  }
  i16() {
    this.need(2);
    const v = this.view.getInt16(this.pos, this.little);
    this.pos += 2;
    return v;
  }
  u16() {
    this.need(2);
    const v = this.view.getUint16(this.pos, this.little);
    this.pos += 2;
    return v;
  }
  i32() {
    this.need(4);
    const v = this.view.getInt32(this.pos, this.little);
    this.pos += 4;
    return v;
  }
  u32() {
    this.need(4);
    const v = this.view.getUint32(this.pos, this.little);
    this.pos += 4;
    return v;
  }
  f32() {
    this.need(4);
    const v = this.view.getFloat32(this.pos, this.little);
    this.pos += 4;
    return v;
  }
  /** 64-bit ints as JS numbers (file offsets stay far below 2^53). */
  i64() {
    this.need(8);
    const v = this.view.getBigInt64(this.pos, this.little);
    this.pos += 8;
    return Number(v);
  }
  u64() {
    this.need(8);
    const v = this.view.getBigUint64(this.pos, this.little);
    this.pos += 8;
    return Number(v);
  }
  /** Path IDs can use the full 64-bit range, so keep them exact. */
  i64Big() {
    this.need(8);
    const v = this.view.getBigInt64(this.pos, this.little);
    this.pos += 8;
    return v;
  }
  take(n: number) {
    this.need(n);
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  skip(n: number) {
    this.need(n);
    this.pos += n;
  }
  align(n = 4) {
    const r = this.pos % n;
    if (r) this.pos += n - r;
  }
  cstring() {
    const start = this.pos;
    const end = this.bytes.indexOf(0, start);
    if (end < 0) throw new RangeError("Unterminated string");
    this.pos = end + 1;
    return utf8.decode(this.bytes.subarray(start, end));
  }
  alignedString() {
    const n = this.i32();
    if (n < 0 || n > this.bytes.byteLength - this.pos) throw new RangeError(`Bad string length ${n}`);
    const s = utf8.decode(this.take(n));
    this.align(4);
    return s;
  }
}
