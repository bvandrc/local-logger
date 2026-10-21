import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/local-logger-react.ts'],
  format: 'esm',
  // Unbundled, so `/react` imports the core rather than carrying a copy of it,
  // and a consumer's bundler tree-shakes per module rather than through one file.
  unbundle: true,
  dts: true,
  clean: true,
  outputOptions: {
    // An inlined dependency would otherwise keep its whole pnpm store path,
    // which changes with the lockfile and sits under a `node_modules` that
    // npm-based tooling skips.
    entryFileNames: ({ name }) =>
      name.includes('node_modules/')
        ? `vendor/${name.split('/dist/').at(-1)}.mjs`
        : '[name].mjs',
  },
  deps: {
    // A dev dependency, so bundled: what the core uses from it is inlined, and
    // a consumer installs nothing for it.
    onlyBundle: ['@bvandrc/react-ui-hooks'],
    // React is the one import the output may keep, and only `/react` has it.
    onlyImport: ['react'],
  },
})
