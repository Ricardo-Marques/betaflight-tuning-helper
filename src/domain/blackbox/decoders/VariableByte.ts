/**
 * Variable-byte decoders — thin wrappers around ByteStream VB methods
 * for the decoder dispatcher interface.
 */
import { ByteStream } from '../ByteStream.ts'

/** Decode a single signed variable-byte field */
export function decodeSignedVB(stream: ByteStream): number {
  return stream.readSignedVB()
}

/** Decode a single unsigned variable-byte field */
export function decodeUnsignedVB(stream: ByteStream): number {
  return stream.readUnsignedVB()
}

/** Decode a neg-14-bit field */
export function decodeNeg14Bit(stream: ByteStream): number {
  return stream.readNeg14Bit()
}
