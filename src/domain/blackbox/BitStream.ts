/**
 * Bit-level reader (MSB-first) wrapping a ByteStream.
 * Used for Elias Delta and Elias Gamma encodings.
 */
import { ByteStream } from './ByteStream.ts'

export class BitStream {
  private stream: ByteStream
  private currentByte: number = 0
  private bitsRemaining: number = 0

  constructor(stream: ByteStream) {
    this.stream = stream
  }

  /** Read a single bit (MSB-first within each byte). */
  readBit(): number {
    if (this.bitsRemaining === 0) {
      this.currentByte = this.stream.readByte()
      this.bitsRemaining = 8
    }
    this.bitsRemaining--
    return (this.currentByte >>> this.bitsRemaining) & 1
  }

  /** Read n bits (MSB-first), returning as unsigned integer. Max 32 bits. */
  readBits(n: number): number {
    let result = 0
    for (let i = 0; i < n; i++) {
      result = (result << 1) | this.readBit()
    }
    return result
  }

  /** Discard any buffered bits, aligning to the next byte boundary. */
  byteAlign(): void {
    this.bitsRemaining = 0
  }

  /** Get the underlying ByteStream (for switching back to byte-level reading). */
  getByteStream(): ByteStream {
    return this.stream
  }
}
