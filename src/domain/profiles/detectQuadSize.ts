import { QuadSize } from '../types/QuadProfile'
import { LogMetadata } from '../types/LogFrame'

export interface DetectionResult {
  suggestedSize: QuadSize
  confidence: number
  reasoning: string[]
}

/**
 * Auto-detect quad size from log metadata using a scoring heuristic.
 * Falls back to 5" with low confidence when no strong signals.
 */
export function detectQuadSize(metadata: LogMetadata): DetectionResult {
  const scores: Record<QuadSize, number> = {
    whoop: 0,
    toothpick3: 0,
    five_inch: 0,
    seven_inch: 0,
    xclass: 0,
  }
  const reasoning: string[] = []

  // 1. Craft name keywords
  const name = (metadata.craftName ?? '').toLowerCase()
  if (name) {
    if (/whoop|tiny|mob|meteor|65|75/.test(name)) {
      scores.whoop += 3
      reasoning.push(`Craft name "${metadata.craftName}" matches whoop keywords`)
    }
    if (/tooth|3"|3 inch|micro|cinewhoop/.test(name)) {
      scores.toothpick3 += 3
      reasoning.push(`Craft name "${metadata.craftName}" matches 3" keywords`)
    }
    if (/5"|five|5 inch|freestyle|race|apex|source/.test(name)) {
      scores.five_inch += 3
      reasoning.push(`Craft name "${metadata.craftName}" matches 5" keywords`)
    }
    if (/7"|seven|7 inch|long.?range|lr|chimera/.test(name)) {
      scores.seven_inch += 3
      reasoning.push(`Craft name "${metadata.craftName}" matches 7" keywords`)
    }
    if (/x.?class|10"|12"|heavy|lift/.test(name)) {
      scores.xclass += 3
      reasoning.push(`Craft name "${metadata.craftName}" matches X-Class keywords`)
    }
  }

  // 2. PID profile D:P ratio hints at frame size
  const pid = metadata.pidProfile
  if (pid?.rollP && pid?.rollD) {
    const dToP = pid.rollD / pid.rollP
    if (dToP > 0.9) {
      scores.whoop += 2
      reasoning.push(`D:P ratio ${dToP.toFixed(2)} is high (typical for whoops)`)
    } else if (dToP > 0.7) {
      scores.toothpick3 += 1
      scores.five_inch += 1
    } else if (dToP < 0.45) {
      scores.seven_inch += 1
      scores.xclass += 2
      reasoning.push(`D:P ratio ${dToP.toFixed(2)} is low (typical for large quads)`)
    }
  }

  // 3. Filter settings — lower cutoffs suggest larger, slower quads
  const filters = metadata.filterSettings
  if (filters?.gyroLpf1Cutoff) {
    const cutoff = filters.gyroLpf1Cutoff
    if (cutoff >= 300) {
      scores.whoop += 1
      scores.toothpick3 += 1
    } else if (cutoff <= 150) {
      scores.seven_inch += 1
      scores.xclass += 1
      reasoning.push(`Low gyro LPF1 cutoff (${cutoff} Hz) suggests larger quad`)
    }
  }

  // 4. Loop rate — whoops often run at 4kHz, racers at 8kHz
  if (metadata.looptime) {
    if (metadata.looptime <= 4000) {
      scores.whoop += 1
    } else if (metadata.looptime >= 8000) {
      scores.five_inch += 1
    }
  }

  // 5. Dynamic idle value — higher for larger quads
  if (pid?.dynamicIdle) {
    if (pid.dynamicIdle >= 40) {
      scores.seven_inch += 1
      scores.xclass += 1
    } else if (pid.dynamicIdle <= 20) {
      scores.whoop += 1
    }
  }

  // Find the winning size
  let bestSize: QuadSize = 'five_inch'
  let bestScore = 0
  for (const [size, score] of Object.entries(scores) as [QuadSize, number][]) {
    if (score > bestScore) {
      bestScore = score
      bestSize = size
    }
  }

  // Confidence: 0-1 based on how decisive the scoring was
  const totalSignals = Object.values(scores).reduce((s, v) => s + v, 0)
  let confidence: number
  if (totalSignals === 0) {
    confidence = 0.2
    reasoning.push('No strong signals found — defaulting to 5"')
    bestSize = 'five_inch'
  } else {
    confidence = Math.min(0.95, 0.3 + (bestScore / totalSignals) * 0.6 + bestScore * 0.05)
  }

  return { suggestedSize: bestSize, confidence, reasoning }
}
