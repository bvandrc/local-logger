import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/local-logger-react.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  outputOptions: {
    // The core both entries share, named for its source rather than hashed.
    chunkFileNames: '[name].mjs',
  },
  deps: {
    // Bundled, so only a dev dependency: what the core uses from it is
    // inlined, and a consumer installs nothing for it.
    onlyBundle: ['@bvandrc/react-ui-hooks'],
    // React is the one import the output may keep, and only `/react` has it.
    onlyImport: ['react'],
  },
})
