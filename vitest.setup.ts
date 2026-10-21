/**
 * @fileoverview Runs before every test file.
 */

import { cleanup } from '@testing-library/react'

// Test files share a worker's modules and its document, so whatever one test
// leaves behind reaches every case after it, in this file or the next.
afterEach(() => {
  // Testing Library registers its own unmount when first imported, which a
  // shared module graph does only for the first file a worker runs.
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
})
