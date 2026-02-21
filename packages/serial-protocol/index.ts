// Re-export entry point for @bf-tuner/serial-protocol
// Metro bundler resolves sub-paths via extraNodeModules pointing to ../../src/serial/
export type { SerialConnection } from '../../src/serial/SerialPort'
export { encodeMspV2Request, parseMspResponse, sendMspCommand, drainSerialBuffer } from '../../src/serial/MspProtocol'
export { downloadDataflash, readDataflashSummary, eraseDataflash, findAllLogs } from '../../src/serial/DataflashReader'
