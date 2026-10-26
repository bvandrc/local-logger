/**
 * @fileoverview Runs before every test file.
 */

// Cases in a file share its document, so whatever one leaves behind reaches
// every case after it.
afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})
