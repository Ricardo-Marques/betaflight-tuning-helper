/**
 * Elias Gamma coding - bit-level decoder for unsigned and signed variants.
 *
 * Simpler than Delta:
 * 1. Count leading zeros → N
 * 2. Read N more bits after the leading 1 → value
 * 3. Subtract 1
 */
import { BitStream } from '../BitStream.ts'
import { zigzagDecode } from '../ByteStream.ts'

/** Decode a single Elias Gamma unsigned value */
export function decodeEliasGammaUnsigned(bits: BitStream): number {
  let leadingZeros = 0
  while (bits.readBit() === 0) {
    leadingZeros++
    if (leadingZeros > 31) return 0 // corrupted
  }

  // We've read the leading 1 bit; read leadingZeros more bits
  let value = 1
  for (let i = 0; i < leadingZeros; i++) {
    value = (value << 1) | bits.readBit()
  }

  return value - 1
}

/** Decode a single Elias Gamma signed value (unsigned + zigzag) */
export function decodeEliasGammaSigned(bits: BitStream): number {
  return zigzagDecode(decodeEliasGammaUnsigned(bits))
}
