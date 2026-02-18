/**
 * Byte-level cursor over a Uint8Array.
 * Provides sequential reading of bytes, lines, and variable-byte integers.
 */
export class ByteStream {
  private data: Uint8Array
  private _offset: number
  private _end: number

  constructor(data: Uint8Array, offset = 0, end?: number) {
    this.data = data
    this._offset = offset
    this._end = end ?? data.length
  }

  get offset(): number {
    return this._offset
  }

  set offset(v: number) {
    this._offset = v
  }

  get end(): number {
    return this._end
  }

  get remaining(): number {
    return this._end - this._offset
  }

  get eof(): boolean {
    return this._offset >= this._end
  }

  readByte(): number {
    if (this._offset >= this._end) {
      throw new RangeError('ByteStream: read past end')
    }
    return this.data[this._offset++]
  }

  peekByte(): number {
    if (this._offset >= this._end) {
      return -1
    }
    return this.data[this._offset]
  }

  /**
   * Read a text line terminated by \n (strips \r\n).
   * Returns null at EOF.
   */
  readLine(): string | null {
    if (this.eof) return null

    const start = this._offset
    while (this._offset < this._end && this.data[this._offset] !== 0x0A) {
      this._offset++
    }

    let lineEnd = this._offset
    // Strip trailing \r
    if (lineEnd > start && this.data[lineEnd - 1] === 0x0D) {
      lineEnd--
    }

    // Skip the \n
    if (this._offset < this._end) {
      this._offset++
    }

    return decodeBytes(this.data, start, lineEnd)
  }

  /**
   * Read an unsigned variable-byte integer (7 bits per byte, MSB = continuation).
   */
  readUnsignedVB(): number {
    let result = 0
    let shift = 0

    for (;;) {
      const b = this.readByte()
      result |= (b & 0x7F) << shift
      if ((b & 0x80) === 0) break
      shift += 7
      if (shift > 28) {
        // Prevent infinite loop on corrupted data; consume remaining continuation bytes
        while (this._offset < this._end && (this.data[this._offset] & 0x80) !== 0) {
          this._offset++
        }
        if (this._offset < this._end) this._offset++ // skip final byte
        break
      }
    }

    return result
  }

  /**
   * Read a signed variable-byte integer (unsigned VB + zigzag decode).
   */
  readSignedVB(): number {
    return zigzagDecode(this.readUnsignedVB())
  }

  /**
   * Read a neg-14-bit value: read unsigned VB, sign-extend from 14 bits, negate.
   * Matches reference: -signExtend14Bit(readUnsignedVB())
   */
  readNeg14Bit(): number {
    const value = this.readUnsignedVB()
    const extended = (value & 0x2000) ? (value | 0xFFFFC000) | 0 : value
    return -extended
  }

  /**
   * Skip n bytes.
   */
  skip(n: number): void {
    this._offset = Math.min(this._offset + n, this._end)
  }

  /**
   * Read n raw bytes.
   */
  readBytes(n: number): Uint8Array {
    const end = Math.min(this._offset + n, this._end)
    const slice = this.data.slice(this._offset, end)
    this._offset = end
    return slice
  }
}

/**
 * ZigZag decode: map unsigned to signed (0→0, 1→-1, 2→1, 3→-2, ...)
 */
export function zigzagDecode(n: number): number {
  return (n >>> 1) ^ -(n & 1)
}

/**
 * Decode a byte range as ASCII/latin1 string.
 */
function decodeBytes(data: Uint8Array, start: number, end: number): string {
  let s = ''
  for (let i = start; i < end; i++) {
    s += String.fromCharCode(data[i])
  }
  return s
}
