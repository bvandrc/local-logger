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
    // The imports the output may keep: es-toolkit, a dependency, and React,
    // which only `/react` imports.
    onlyImport: ['es-toolkit', 'react'],
  },
})
