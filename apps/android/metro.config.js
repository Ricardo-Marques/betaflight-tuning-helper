const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

// Root of the monorepo
const repoRoot = path.resolve(__dirname, '../..')

const config = getDefaultConfig(__dirname)

// Watch the shared source directories at the repo root so Metro can resolve them
config.watchFolders = [
  path.join(repoRoot, 'src/domain'),
  path.join(repoRoot, 'src/serial'),
  path.join(repoRoot, 'src/lib'),
  path.join(repoRoot, 'packages'),
]

// Map @bf-tuner/* package names directly to source directories.
// This bypasses Metro's symlink resolution issues with pnpm workspaces.
//
// Also pin react, react-native, mobx and mobx-react-lite to the Android app's
// node_modules. Without this, files in src/domain/ (outside the app dir) walk
// up the directory tree and find React 18 in the repo root, while app files get
// React 19 — causing "Cannot read property ReactCurrentOwner of undefined".
config.resolver.extraNodeModules = {
  '@bf-tuner/domain': path.join(repoRoot, 'src/domain'),
  '@bf-tuner/serial-protocol': path.join(repoRoot, 'src/serial'),
  'react': path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
  'mobx': path.resolve(__dirname, 'node_modules/mobx'),
  'mobx-react-lite': path.resolve(__dirname, 'node_modules/mobx-react-lite'),
}

// Keep root node_modules as a fallback for packages not in the app's node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(repoRoot, 'node_modules'),
]

// Ensure Metro can resolve TypeScript files from the shared source
config.resolver.sourceExts = [...config.resolver.sourceExts, 'ts', 'tsx']

// Allow Metro to serve .bfl binary files as assets (for bundled sample logs)
config.resolver.assetExts = [...config.resolver.assetExts, 'bfl']

module.exports = config
