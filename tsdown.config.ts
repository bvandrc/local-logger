import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/react.ts'],
  format: 'esm',
  // Unbundled, so `/react` imports the core rather than carrying a copy of it,
  // and a consumer's bundler tree-shakes per module rather than through one file.
  unbundle: true,
  dts: true,
  clean: true,
})
