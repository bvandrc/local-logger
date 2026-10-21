import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // A spy declared once for a `describe` starts each case empty, so a
    // `toHaveBeenCalledWith` cannot pass on a call from the case before it.
    clearMocks: true,
    // A stubbed global or env var a case forgets to undo would otherwise reach
    // every file after it, since files share a worker's modules (`isolate`).
    unstubGlobals: true,
    unstubEnvs: true,
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
    // Files in a worker share one module graph and document instead of each
    // loading its own, which is most of what a run costs. The setup file and
    // the options above reset what a test can leave behind; `pnpm run
    // test:isolated` reruns with isolation, to check whether a failure depends
    // on what another file left behind.
    isolate: false,
    // Shuffled so a file that only passes on what an earlier one left behind
    // eventually runs first and fails. A failing run prints its seed, which
    // `--sequence.seed=<n>` replays.
    sequence: { shuffle: { files: true } },
    setupFiles: ['./vitest.setup.ts'],
  },
})
