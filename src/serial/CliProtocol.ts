/**
 * Betaflight CLI protocol handler.
 * Sends text commands over a SerialConnection and parses responses.
 */
import type { SerialConnection } from './SerialPort'

const CLI_PROMPT = '#'
const CLI_ENTER = '#\n'
const COMMAND_TIMEOUT_MS = 5000
const SAVE_TIMEOUT_MS = 10000

export interface CommandResult {
  command: string
  response: string
  index: number
}

export interface WriteResult {
  commandsSent: number
  errors: string[]
}

/**
 * Enter Betaflight CLI mode by sending '#' and waiting for the prompt.
 */
export async function enterCliMode(connection: SerialConnection): Promise<void> {
  await connection.write(CLI_ENTER)
  await connection.readUntilPrompt(CLI_PROMPT, COMMAND_TIMEOUT_MS)
}

/**
 * Send a single CLI command and return the response text.
 */
export async function sendCommand(
  connection: SerialConnection,
  command: string,
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<string> {
  await connection.write(command + '\n')
  const raw = await connection.readUntilPrompt(CLI_PROMPT, timeoutMs)
  // Strip the echoed command and trailing prompt
  return cleanResponse(raw, command)
}

/**
 * Send multiple commands, yielding progress after each one.
 */
export async function* sendCommands(
  connection: SerialConnection,
  commands: string[],
): AsyncGenerator<CommandResult> {
  for (let i = 0; i < commands.length; i++) {
    const command = commands[i]
    const response = await sendCommand(connection, command)
    yield { command, response, index: i }
  }
}

/**
 * Read settings from the FC by sending get commands from the generated script.
 * Returns the concatenated CLI output suitable for BetaflightSettingsParser.
 */
export async function readSettings(
  connection: SerialConnection,
  getScript: string,
  onProgress?: (progress: number, command: string) => void,
): Promise<string> {
  const commands = getScript
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))

  if (commands.length === 0) return ''

  const responses: string[] = []
  for await (const result of sendCommands(connection, commands)) {
    responses.push(result.response)
    onProgress?.(((result.index + 1) / commands.length) * 100, result.command)
  }

  return responses.join('\n')
}

/**
 * Write tuning settings to the FC, then save.
 * The `save` command causes the FC to reboot, which drops the connection.
 */
export async function writeSettings(
  connection: SerialConnection,
  cliCommands: string,
  onProgress?: (progress: number, command: string) => void,
): Promise<WriteResult> {
  const commands = cliCommands
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('set '))

  const errors: string[] = []
  let commandsSent = 0

  for await (const result of sendCommands(connection, commands)) {
    commandsSent++
    // Betaflight returns "Invalid" or "Error" for bad set commands
    if (/invalid|error/i.test(result.response)) {
      errors.push(`${result.command}: ${result.response.trim()}`)
    }
    onProgress?.(((result.index + 1) / (commands.length + 1)) * 100, result.command)
  }

  // Send `save` — this reboots the FC and the connection will drop
  onProgress?.(((commands.length) / (commands.length + 1)) * 100, 'save')
  try {
    await connection.write('save\n')
    // The FC reboots after save, so reading will likely timeout or disconnect
    await connection.readUntilPrompt(CLI_PROMPT, SAVE_TIMEOUT_MS).catch(() => {
      // Expected — FC reboots and drops connection
    })
  } catch {
    // Expected — connection drops on reboot
  }

  return { commandsSent, errors }
}

/**
 * Send `exit` to leave CLI mode gracefully.
 */
export async function exitCliMode(connection: SerialConnection): Promise<void> {
  try {
    await connection.write('exit\n')
  } catch {
    // Connection may already be closed
  }
}

/** Strip echoed command and trailing prompt from raw response */
function cleanResponse(raw: string, command: string): string {
  let cleaned = raw
  // The FC echoes the command back — remove it
  const echoIdx = cleaned.indexOf(command)
  if (echoIdx !== -1) {
    cleaned = cleaned.slice(echoIdx + command.length)
  }
  // Remove trailing prompt
  const promptIdx = cleaned.lastIndexOf(CLI_PROMPT)
  if (promptIdx !== -1) {
    cleaned = cleaned.slice(0, promptIdx)
  }
  return cleaned.trim()
}
