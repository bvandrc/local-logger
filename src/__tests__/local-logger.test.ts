import { LocalLogger, type LogEntry } from '../local-logger'

const STORAGE_KEY = 'test-local-log'

/** A logger as a page load gets one, persisting under `STORAGE_KEY`. */
const createLogger = () => new LocalLogger({ storageKey: STORAGE_KEY })

const localLog = createLogger()

const getLastEntry = () => localLog.getEntries().at(-1)

/** Fires what a page leaving fires, so every logger still listening writes. */
const leavePage = () => window.dispatchEvent(new Event('pagehide'))

describe('LocalLogger.error', () => {
  it('logs an Error as its message and stack, beside extra', () => {
    const ERROR = new Error('boom')
    localLog.error('api', 'items.list:failed', ERROR, { status: 500 })
    expect(getLastEntry()).toMatchObject({
      level: 'error',
      scope: 'api',
      action: 'items.list:failed',
      detail: { message: 'boom', stack: ERROR.stack, status: 500 },
    })
  })
})

describe('LocalLogger.catchTo', () => {
  it('swallows a rejection and logs it as an error', async () => {
    await expect(
      Promise.reject(new Error('gone')).catch(
        localLog.catchTo('sync', 'release:failed')
      )
    ).resolves.toBeUndefined()
    expect(getLastEntry()).toMatchObject({
      level: 'error',
      scope: 'sync',
      action: 'release:failed',
      detail: { message: 'gone' },
    })
  })
})

describe('LocalLogger.withScope', () => {
  it('logs under the scope it was given', () => {
    localLog.withScope('cart').warn('scoped:warn', { id: 1 })
    expect(getLastEntry()).toMatchObject({
      level: 'warn',
      scope: 'cart',
      action: 'scoped:warn',
      detail: { id: 1 },
    })
  })
})

describe('LocalLogger.getEntries', () => {
  it('orders entries by when they were logged, across tabs', () => {
    const STORED = [
      { timestamp: '2026-01-01T00:00:02.000Z', scope: 'cart', action: 'b' },
      // A second tab wrote after the first, but had logged earlier.
      { timestamp: '2026-01-01T00:00:01.000Z', scope: 'cart', action: 'a' },
    ] satisfies LogEntry[]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(STORED))
    const actions = createLogger()
      .getEntries()
      .map(({ action }) => action)
    expect(actions).toEqual(['a', 'b'])
  })
})

describe('LocalLogger persistence', () => {
  /**
   * A fresh logger, as a reload or a relaunch gets one. Each case writes
   * through its own: every earlier one is still listening, and the newest
   * writes last.
   */
  const reload = createLogger

  it('carries entries across a reload once the page hides', () => {
    const logger = reload()
    logger.info('cart', 'delete', { id: 7 })
    leavePage()
    expect(reload().getEntries()).toContainEqual(
      expect.objectContaining({ action: 'delete', detail: { id: 7 } })
    )
  })

  it('keeps what two tabs logged, whichever writes last', () => {
    const firstTab = reload()
    const secondTab = reload()
    // The second tab has already read the log, e.g. for a report.
    secondTab.getEntries()
    firstTab.info('cart', 'tab:first')
    secondTab.info('cart', 'tab:second')
    // Both tabs write, in turn.
    leavePage()
    const actions = reload()
      .getEntries()
      .map(({ action }) => action)
    expect(actions).toEqual(expect.arrayContaining(['tab:first', 'tab:second']))
  })

  it('writes an entry only once across repeated hides', () => {
    const logger = reload()
    logger.info('cart', 'hide:once')
    leavePage()
    leavePage()
    const matches = reload()
      .getEntries()
      .filter(({ action }) => action === 'hide:once')
    expect(matches).toHaveLength(1)
  })

  it('reads nothing from storage at startup', () => {
    const getItemSpy = vi.spyOn(localStorage, 'getItem')
    reload()
    const readKeys = getItemSpy.mock.calls.map(([key]) => key)
    getItemSpy.mockRestore()
    expect(readKeys).not.toContain(STORAGE_KEY)
  })

  it('keeps only the newest 300 entries', () => {
    const STORED = Array.from({ length: 400 }, (_, index) => ({
      timestamp: new Date(0).toISOString(),
      scope: 'cart',
      action: `stored:${index}`,
    })) satisfies LogEntry[]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(STORED))
    const entries = reload().getEntries()
    expect(entries).toHaveLength(300)
    // The newest, not the oldest.
    expect(entries.at(-1)).toMatchObject({ action: 'stored:399' })
  })

  it('starts over from a stored value it cannot read', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'a list' }))
    expect(reload().getEntries()).toEqual([])
  })
})
