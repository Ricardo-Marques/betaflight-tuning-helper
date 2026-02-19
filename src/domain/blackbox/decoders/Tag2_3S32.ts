/**
 * TAG2_3S32 decoder - consumes 3 fields.
 *
 * The top 2 bits of the lead byte select the format (NOT a separate byte):
 *   0 → 3 × 2-bit signed in the remaining 6 bits of the lead byte
 *   1 → 3 × 4-bit signed: low nibble of lead byte + 1 more byte
 *   2 → 3 × 6-bit signed: low 6 bits of lead byte + 2 more bytes (low 6 bits each)
 *   3 → Per-field variable size: low 6 bits = 3×2-bit size selectors, then LE byte reads
 */
import { ByteStream } from '../ByteStream.ts'

function signExtend(value: number, bits: number): number {
  const mask = 1 << (bits - 1)
  return (value ^ mask) - mask
}

export function decodeTag2_3S32(
  stream: ByteStream,
  out: number[],
  outOffset: number,
): void {
  const leadByte = stream.readByte()
  const selector = leadByte >> 6

  switch (selector) {
    case 0: {
      // 3 × 2-bit signed packed in the lead byte: bits [5:4], [3:2], [1:0]
      out[outOffset]     = signExtend((leadByte >> 4) & 0x03, 2)
      out[outOffset + 1] = signExtend((leadByte >> 2) & 0x03, 2)
      out[outOffset + 2] = signExtend(leadByte & 0x03, 2)
      break
    }
    case 1: {
      // 3 × 4-bit signed: lead byte low nibble + next byte
      out[outOffset] = signExtend(leadByte & 0x0F, 4)
      const b1 = stream.readByte()
      out[outOffset + 1] = signExtend(b1 >> 4, 4)
      out[outOffset + 2] = signExtend(b1 & 0x0F, 4)
      break
    }
    case 2: {
      // 3 × 6-bit signed: low 6 bits of each byte
      out[outOffset]     = signExtend(leadByte & 0x3F, 6)
      out[outOffset + 1] = signExtend(stream.readByte() & 0x3F, 6)
      out[outOffset + 2] = signExtend(stream.readByte() & 0x3F, 6)
      break
    }
    case 3: {
      // Per-field variable size: bottom 6 bits = 3 × 2-bit size selectors (LSB first)
      // Size: 0=8-bit, 1=16-bit LE, 2=24-bit LE, 3=32-bit LE
      let selectorBits = leadByte
      for (let i = 0; i < 3; i++) {
        const fieldSize = selectorBits & 0x03
        switch (fieldSize) {
          case 0:
            out[outOffset + i] = signExtend(stream.readByte(), 8)
            break
          case 1: {
            const c1 = stream.readByte()
            const c2 = stream.readByte()
            out[outOffset + i] = signExtend(c1 | (c2 << 8), 16)
            break
          }
          case 2: {
            const c1 = stream.readByte()
            const c2 = stream.readByte()
            const c3 = stream.readByte()
            const v = c1 | (c2 << 8) | (c3 << 16)
            // Sign-extend from 24 bits
            out[outOffset + i] = (v & 0x800000) ? (v | 0xFF000000) | 0 : v
            break
          }
          case 3: {
            out[outOffset + i] = stream.readByte() |
              (stream.readByte() << 8) |
              (stream.readByte() << 16) |
              (stream.readByte() << 24)
            break
          }
        }
        selectorBits >>= 2
      }
      break
    }
  }
}
