/**
 * TAG8_8SVB decoder - consumes up to 8 fields.
 *
 * When count == 1: reads a single signedVB directly (NO header byte).
 * When count > 1: reads a header byte where each bit indicates non-zero, then signedVB per set bit.
 */
import { ByteStream } from '../ByteStream.ts'

export function decodeTag8_8SVB(
  stream: ByteStream,
  count: number,
  out: number[],
  outOffset: number,
): void {
  if (count === 1) {
    // Special case: no header byte, just a single signedVB
    out[outOffset] = stream.readSignedVB()
    return
  }

  let header = stream.readByte()

  for (let i = 0; i < count; i++, header >>= 1) {
    if (header & 0x01) {
      out[outOffset + i] = stream.readSignedVB()
    } else {
      out[outOffset + i] = 0
    }
  }
}
