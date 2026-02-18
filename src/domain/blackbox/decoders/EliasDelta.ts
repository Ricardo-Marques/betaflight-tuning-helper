/**
 * Elias Delta coding — bit-level decoder for unsigned and signed variants.
 *
 * Elias Delta encoding:
 * 1. Read number of leading zeros → that's the length of the "length" part
 * 2. Read that many more bits to get the full length L
 * 3. Read L-1 more bits and prepend a 1-bit to get the value
 * 4. Subtract 1 (since Elias Delta encodes values starting from 1)
 *
 * For signed: apply zigzag decode after.
 */
import { BitStream } from '../BitStream.ts'
import { zigzagDecode } from '../ByteStream.ts'

/** Decode a single Elias Delta unsigned value */
export function decodeEliasDeltaUnsigned(bits: BitStream): number {
  // Count leading zeros
  let leadingZeros = 0
  while (bits.readBit() === 0) {
    leadingZeros++
    if (leadingZeros > 31) return 0 // corrupted
  }

  // Read the length value (we already read the leading 1)
  let lengthVal = 1
  for (let i = 0; i < leadingZeros; i++) {
    lengthVal = (lengthVal << 1) | bits.readBit()
  }

  // Read lengthVal - 1 more bits for the actual value
  let value = 1
  for (let i = 0; i < lengthVal - 1; i++) {
    value = (value << 1) | bits.readBit()
  }

  // Elias Delta encodes values starting from 1, so subtract 1
  return value - 1
}

/** Decode a single Elias Delta signed value (unsigned + zigzag) */
export function decodeEliasDeltaSigned(bits: BitStream): number {
  return zigzagDecode(decodeEliasDeltaUnsigned(bits))
}
