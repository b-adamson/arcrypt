/**
 * Minimal borsh encoders for the dummy program's ix args. Built inline rather
 * than pulling a borsh library because the arg shapes are fully fixed at the
 * IDL level and only ever need encoding (the dummy program decodes on-chain
 * via anchor-borsh).
 */

export class BorshWriter {
  private buf: number[] = [];

  u8(n: number): this {
    this.buf.push(n & 0xff);
    return this;
  }
  u32(n: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    for (const x of b) this.buf.push(x);
    return this;
  }
  u64(n: bigint): this {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, n, true);
    for (const x of b) this.buf.push(x);
    return this;
  }
  u128(n: bigint): this {
    // LE 16 bytes
    let v = n;
    for (let i = 0; i < 16; i++) {
      this.buf.push(Number(v & 0xffn));
      v >>= 8n;
    }
    return this;
  }
  i64(n: bigint): this {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigInt64(0, n, true);
    for (const x of b) this.buf.push(x);
    return this;
  }
  bytes(b: Uint8Array | ArrayLike<number>): this {
    for (let i = 0; i < (b as ArrayLike<number>).length; i++) {
      this.buf.push((b as ArrayLike<number>)[i] & 0xff);
    }
    return this;
  }
  vec(b: Uint8Array): this {
    return this.u32(b.length).bytes(b);
  }
  build(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}
