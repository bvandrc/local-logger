import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // A spy declared once for a `describe` starts each case empty, so a
    // `toHaveBeenCalledWith` cannot pass on a call from the case before it.
    clearMocks: true,
    // A stubbed global or env var a case forgets to undo would otherwise reach
    // every case after it in the same file.
    unstubGlobals: true,
    unstubEnvs: true,
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
