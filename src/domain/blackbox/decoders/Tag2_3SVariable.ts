/**
 * TAG2_3SVariable decoder - Betaflight variant, consumes 3 fields.
 *
 * Top 2 bits of lead byte select format:
 *   0 → 3 × 2-bit signed in remaining bits of lead byte (same as TAG2_3S32)
 *   1 → 5-5-4 bits: split across lead byte + 1 more byte
 *   2 → 8-7-7 bits: split across lead byte + 2 more bytes
 *   3 → Per-field variable size (same as TAG2_3S32 selector 3)
 */
import { ByteStream } from '../ByteStream.ts'

function signExtend(value: number, bits: number): number {
  const mask = 1 << (bits - 1)
  return (value ^ mask) - mask
}

export function decodeTag2_3SVariable(
  stream: ByteStream,
  out: number[],
  outOffset: number,
): void {
  const leadByte = stream.readByte()
  const selector = leadByte >> 6

  switch (selector) {
    case 0: {
      // Same as TAG2_3S32: 3 × 2-bit signed in lead byte
      out[outOffset]     = signExtend((leadByte >> 4) & 0x03, 2)
      out[outOffset + 1] = signExtend((leadByte >> 2) & 0x03, 2)
      out[outOffset + 2] = signExtend(leadByte & 0x03, 2)
      break
    }
    case 1: {
      // 5-5-4 bits across 2 bytes total
      // Lead byte: ss|11111|x → bits [5:1] = value[0] (5 bits)
      // Byte 2: y|22222|3333 → combined: bit 0 of lead + top 4 of byte2 = value[1] (5 bits)
      //                        bottom 4 of byte2 = value[2] (4 bits)
      const b2 = stream.readByte()
      out[outOffset]     = signExtend((leadByte & 0x3E) >> 1, 5)
      out[outOffset + 1] = signExtend(((leadByte & 0x01) << 4) | ((b2 & 0xF0) >> 4), 5)
      out[outOffset + 2] = signExtend(b2 & 0x0F, 4)
      break
    }
    case 2: {
      // 8-7-7 bits across 3 bytes total
      // Lead byte: ss|111111 → low 6 bits are top 6 bits of value[0]
      // Byte 2: 11|222222 → top 2 bits complete value[0], low 6 bits are top 6 of value[1]
      // Byte 3: 2|3333333 → top bit completes value[1], low 7 bits are value[2]
      const b2 = stream.readByte()
      const b3 = stream.readByte()
      out[outOffset]     = signExtend(((leadByte & 0x3F) << 2) | ((b2 & 0xC0) >> 6), 8)
      out[outOffset + 1] = signExtend(((b2 & 0x3F) << 1) | ((b3 & 0x80) >> 7), 7)
      out[outOffset + 2] = signExtend(b3 & 0x7F, 7)
      break
    }
    case 3: {
      // Same as TAG2_3S32 selector 3: per-field variable size
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
