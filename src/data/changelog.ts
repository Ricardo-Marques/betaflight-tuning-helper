import type { ChangelogEntry } from '../domain/types/Changelog'

/**
 * Curated changelog entries shown in the "What's New" modal.
 * Only include changes users would actually care about.
 *
 * When making commits, consider adding an entry here if the change
 * is user-facing (new feature, meaningful fix, or UX improvement).
 */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  // 2026-02-20
  { hash: '2b24b7f', date: '2026-02-20', message: 'Gyro noise issues now describe which frequency band the noise is in (low/mid/high) instead of just showing a high-freq percentage', category: 'improvement' },
  { hash: '161f16c', date: '2026-02-20', message: 'Smarter recommendations when feedforward data is available — detects FF-driven overshoot, noisy FF from RC link, and chooses between P and FF fixes based on actual contribution', category: 'improvement' },
  { hash: '1795fc2', date: '2026-02-20', message: 'Chart feedforward (FF) output from Betaflight 4.1+ logs as a toggleable data series', category: 'feature' },
  { hash: '06a8493', date: '2026-02-20', message: 'Filter recommendations no longer misleadingly say "on roll" or "on pitch" — filters are global', category: 'fix' },
  { hash: 'cc60bca', date: '2026-02-20', message: 'Limit issue occurrences to the 5 most confident, reducing chart clutter on busy logs', category: 'improvement' },

  // 2026-02-19
  { hash: '3795c10', date: '2026-02-19', message: 'Detect 7 new issue types: electrical noise, CG offset, motor health, bearing noise, frame resonance, ESC desync, and voltage sag', category: 'feature' },
  { hash: '8e7ec1c', date: '2026-02-19', message: 'Smarter chart tooltips that avoid overlapping issue popovers', category: 'improvement' },
  { hash: '8e7ec1c', date: '2026-02-19', message: 'Zoom hints when you reach the edge or hit the zoom limit', category: 'improvement' },
  { hash: '185731f', date: '2026-02-19', message: 'Analysis shows progress instead of freezing on large logs', category: 'fix' },
  { hash: 'ec22807', date: '2026-02-19', message: 'Large log files load faster with chunked parsing', category: 'improvement' },
  { hash: 'efee68a', date: '2026-02-19', message: 'Safety warning now clearly states the tool is experimental — always cross-reference suggestions', category: 'improvement' },
  { hash: '4cce095', date: '2026-02-19', message: 'Spectrum view no longer freezes when toggling on large logs', category: 'fix' },
  { hash: '587ca37', date: '2026-02-19', message: 'Zoom slider shows true zoom depth with an inner accent bar', category: 'improvement' },
  { hash: '7102fa3', date: '2026-02-19', message: 'Selected issue line now stands out clearly on busy charts', category: 'improvement' },
  { hash: '5068134', date: '2026-02-19', message: 'Chart waveform no longer shifts when zooming in and out', category: 'fix' },
  { hash: '41c0f5f', date: '2026-02-19', message: 'Bigger touch targets and text on mobile for easier tapping', category: 'improvement' },
  { hash: 'b15255b', date: '2026-02-19', message: 'Mobile-friendly layout with bottom tab navigation', category: 'feature' },
  { hash: 'b15255b', date: '2026-02-19', message: 'Install as an app on your phone or tablet (PWA)', category: 'feature' },

  // 2026-02-18
  { hash: '35838eb', date: '2026-02-18', message: 'Download blackbox logs directly from the FC via USB', category: 'feature' },
  { hash: '889be0a', date: '2026-02-18', message: 'Offer to clear blackbox logs from the FC after writing a tune', category: 'improvement' },
  { hash: '9718e3c', date: '2026-02-18', message: 'Show a message when no tuning changes are recommended', category: 'improvement' },
  { hash: '754f7d1', date: '2026-02-18', message: 'Let users reconnect to the FC after a connection error', category: 'fix' },
  { hash: '8d2e4d9', date: '2026-02-18', message: 'Smoother scroll-to-zoom on the chart', category: 'improvement' },
  { hash: '2667971', date: '2026-02-18', message: 'Read and write settings directly to your FC via USB (Chrome/Edge)', category: 'feature' },
  { hash: '2667971', date: '2026-02-18', message: 'Accept tune now shows all changes with before/after values for review', category: 'improvement' },
  { hash: '2667971', date: '2026-02-18', message: 'Restore settings from your last session without re-importing', category: 'improvement' },
  { hash: 'c11439c', date: '2026-02-18', message: 'Imported settings now require explicit review before affecting CLI output', category: 'improvement' },
  { hash: 'af653cb', date: '2026-02-18', message: 'Hide parameter changes that already match your current value', category: 'improvement' },
  { hash: 'c8c7dc8', date: '2026-02-18', message: 'Import your Betaflight settings and accept tune to iterate between flights', category: 'feature' },
  { hash: '42ae970', date: '2026-02-18', message: 'Safety warning on the home page reminding to review changes before flying', category: 'improvement' },
  { hash: 'c9d7373', date: '2026-02-18', message: 'Upload a different file button is easier to find', category: 'improvement' },
  { hash: '5e64923', date: '2026-02-18', message: 'Try it instantly with a built-in sample log', category: 'feature' },
  { hash: 'c4c64f6', date: '2026-02-18', message: 'Quad profile now defaults to 5" instead of unreliable auto-detection', category: 'improvement' },
  { hash: '9058924', date: '2026-02-18', message: 'Fix text wrapping on recommendation cards', category: 'fix' },
  { hash: 'a7dfd93', date: '2026-02-18', message: 'Redesigned summary panel with severity badges and top priorities', category: 'improvement' },
  { hash: '02cfb82', date: '2026-02-18', message: 'Colored chart toggle chips replace checkboxes', category: 'improvement' },
  { hash: '199e93b', date: '2026-02-18', message: 'Redesigned upload screen with drag-and-drop and feature highlights', category: 'improvement' },
  { hash: '3e440ac', date: '2026-02-18', message: 'Draggable resize handles between panels', category: 'feature' },
  { hash: 'd8ce216', date: '2026-02-18', message: 'Issue markers show exact problem location on chart', category: 'feature' },
  { hash: 'd8ce216', date: '2026-02-18', message: 'Throttle trace overlay', category: 'feature' },
  { hash: 'd8ce216', date: '2026-02-18', message: 'Chart hints explain what each issue looks like', category: 'feature' },
  { hash: '2e21b24', date: '2026-02-18', message: 'Click issues to zoom to the exact spot in your flight', category: 'feature' },
  { hash: '18fbe36', date: '2026-02-18', message: 'Off-axis issues fade so you can focus on the selected axis', category: 'improvement' },
  { hash: 'c059f75', date: '2026-02-18', message: 'Feedforward analysis and extended yaw coverage', category: 'feature' },
  { hash: 'bd8c0bb', date: '2026-02-18', message: 'Fix filter recommendations giving opposite advice', category: 'fix' },
  { hash: '3f756aa', date: '2026-02-18', message: 'Fix harmful tuning recommendations', category: 'fix' },
  { hash: 'c02c1b8', date: '2026-02-18', message: 'Fix crash on large log files', category: 'fix' },
  { hash: '3031c45', date: '2026-02-18', message: 'Analysis level selector (Basic / Average / Expert)', category: 'feature' },

  // 2026-02-17
  { hash: '0c5ff5e', date: '2026-02-17', message: 'Issues toggle and independent motor Y-axis scaling', category: 'feature' },
  { hash: '332cba8', date: '2026-02-17', message: 'Scroll-to-zoom on chart', category: 'feature' },
  { hash: 'c1bb0c5', date: '2026-02-17', message: 'Dark mode with theme toggle', category: 'feature' },
  { hash: '8570440', date: '2026-02-17', message: 'Quad profile selector (Whoop, 3", 5", 7", X-Class)', category: 'feature' },
  { hash: 'f0d18d1', date: '2026-02-17', message: 'Copy-paste CLI commands for all recommendations', category: 'feature' },
  { hash: 'f0d18d1', date: '2026-02-17', message: 'Navigate between multiple occurrences of the same issue', category: 'feature' },
  { hash: '3cf3aae', date: '2026-02-17', message: 'Native .bbl/.bfl binary parser (no WASM needed)', category: 'feature' },
]
