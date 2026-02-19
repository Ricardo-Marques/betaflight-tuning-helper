/**
 * TAG8_4S16 v2 decoder - consumes 4 fields.
 *
 * Header byte: 4 × 2-bit width selectors, LSB-first (bits [1:0] = field 0).
 * Width codes:
 *   0 → value is 0
 *   1 → 4-bit signed (nibble with buffering)
 *   2 → 8-bit signed (with nibble straddling if pending)
 *   3 → 16-bit signed big-endian (with nibble straddling if pending)
 *
 * Nibble buffering: First 4-bit read takes HIGH nibble, second takes LOW nibble.
 * 8/16-bit reads with a pending nibble combine the leftover nibble with new bytes.
 */
import { ByteStream } from '../ByteStream.ts'

function signExtend4(v: number): number { return (v & 0x08) ? (v | 0xFFFFFFF0) | 0 : v }
function signExtend8(v: number): number { return (v & 0x80) ? (v | 0xFFFFFF00) | 0 : v }
function signExtend16(v: number): number { return (v & 0x8000) ? (v | 0xFFFF0000) | 0 : v }

export class Tag8_4S16Decoder {
  private nibbleBuffer: number = 0
  private hasNibble: boolean = false

  /** Reset nibble buffer - called at start of each TAG8_4S16 decode call */
  resetNibble(): void {
    this.hasNibble = false
    this.nibbleBuffer = 0
  }

  decode(
    stream: ByteStream,
    out: number[],
    outOffset: number,
  ): void {
    let selector = stream.readByte()
    // Reset nibble state at start of each TAG8_4S16 group (matches reference)
    this.hasNibble = false

    for (let i = 0; i < 4; i++) {
      const width = selector & 0x03
      selector >>= 2

      switch (width) {
        case 0:
          out[outOffset + i] = 0
          break

        case 1: {
          // 4-bit nibble with buffering
          if (!this.hasNibble) {
            this.nibbleBuffer = stream.readByte()
            out[outOffset + i] = signExtend4((this.nibbleBuffer >> 4) & 0x0F) // HIGH nibble first
            this.hasNibble = true
          } else {
            out[outOffset + i] = signExtend4(this.nibbleBuffer & 0x0F) // LOW nibble second
            this.hasNibble = false
          }
          break
        }

        case 2: {
          // 8-bit signed, with nibble straddling
          if (!this.hasNibble) {
            out[outOffset + i] = signExtend8(stream.readByte())
          } else {
            // Straddle: low nibble of buffer + high nibble of new byte
            const newByte = stream.readByte()
            const combined = ((this.nibbleBuffer & 0x0F) << 4) | (newByte >> 4)
            out[outOffset + i] = signExtend8(combined)
            this.nibbleBuffer = newByte
            // hasNibble stays true - low nibble of newByte is pending
          }
          break
        }

        case 3: {
          // 16-bit signed big-endian, with nibble straddling
          if (!this.hasNibble) {
            const hi = stream.readByte()
            const lo = stream.readByte()
            out[outOffset + i] = signExtend16((hi << 8) | lo)
          } else {
            // Straddle: low nibble of buffer + 2 bytes
            const b1 = stream.readByte()
            const b2 = stream.readByte()
            const combined = ((this.nibbleBuffer & 0x0F) << 12) | (b1 << 4) | (b2 >> 4)
            out[outOffset + i] = signExtend16(combined)
            this.nibbleBuffer = b2
            // hasNibble stays true
          }
          break
        }
      }
    }
  }
}
