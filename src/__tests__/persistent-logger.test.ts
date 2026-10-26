import { type LogEntry, PersistentLogger } from '../persistent-logger'

const STORAGE_KEY = 'test-log'

/** A logger as a page load gets one, persisting under `STORAGE_KEY`. */
const createLogger = (options?: { maxStoredLength?: number }) =>
  new PersistentLogger({ storageKey: STORAGE_KEY, ...options })

const localLog = createLogger()

const getLastEntry = () => localLog.getEntries().at(-1)

/** Fires what a page leaving fires, so every logger still listening writes. */
const leavePage = () => window.dispatchEvent(new Event('pagehide'))

describe('PersistentLogger.error', () => {
  it('logs an Error spelled out, beside extra', () => {
    const ERROR = new Error('boom')
    localLog.error('api', 'items.list:failed', ERROR, { status: 500 })
    expect(getLastEntry()).toEqual({
      timestamp: expect.any(String),
      level: 'error',
      scope: 'api',
      action: 'items.list:failed',
      detail: {
        name: 'Error',
        message: 'boom',
        stack: ERROR.stack,
        status: 500,
      },
    })
  })

  it('logs an Error as its name, cause, and own fields too', () => {
    const CAUSE = new RangeError('inner')
    const ERROR = Object.assign(new TypeError('outer', { cause: CAUSE }), {
      code: 'E_FETCH',
    })
    localLog.error('api', 'items.list:failed', ERROR)
    expect(getLastEntry()?.detail).toEqual({
      name: 'TypeError',
      message: 'outer',
      stack: ERROR.stack,
      code: 'E_FETCH',
      // Spelled out the same way, rather than as the `{}` JSON makes of it.
      cause: { name: 'RangeError', message: 'inner', stack: CAUSE.stack },
    })
  })

  it('logs anything else thrown as it is, under thrown', () => {
    // An object as well as a string: String() would make it '[object Object]'.
    for (const THROWN of ['offline', { status: 404 }]) {
      localLog.error('api', 'items.list:rejected', THROWN)
      expect(getLastEntry()?.detail, String(THROWN)).toEqual({ thrown: THROWN })
    }
  })
})

describe('PersistentLogger.catchTo', () => {
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

describe('PersistentLogger.withScope', () => {
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

describe('PersistentLogger.clear', () => {
  it('empties what is stored and what is not yet saved', () => {
    const logger = createLogger()
    logger.info('cart', 'clear:saved')
    leavePage()
    logger.info('cart', 'clear:unsaved')
    logger.clear()
    expect(logger.getEntries()).toEqual([])
    leavePage()
    expect(createLogger().getEntries()).toEqual([])
  })
})

describe('PersistentLogger.getEntries', () => {
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

describe('PersistentLogger persistence', () => {
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

  it('saves an Error inside any detail spelled out', () => {
    const logger = reload()
    logger.warn('sync', 'retry', { attempt: 2, last: new Error('timeout') })
    leavePage()
    expect(reload().getEntries().at(-1)?.detail).toMatchObject({
      attempt: 2,
      last: { name: 'Error', message: 'timeout' },
    })
  })

  it('starts over from a stored value it cannot read', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'a list' }))
    expect(reload().getEntries()).toEqual([])
  })

  it('stores only the newest entries that fit in maxStoredLength', () => {
    const MAX_STORED_LENGTH = 1000
    const logger = reload({ maxStoredLength: MAX_STORED_LENGTH })
    for (let index = 0; index < 50; index++) {
      logger.info('cart', `fit:${index}`)
    }
    leavePage()
    const stored = localStorage.getItem(STORAGE_KEY) ?? ''
    expect(stored.length).toBeLessThanOrEqual(MAX_STORED_LENGTH)
    const actions = reload()
      .getEntries()
      .map(({ action }) => action)
    // The newest, not the oldest.
    expect(actions.at(-1)).toBe('fit:49')
    expect(actions).not.toContain('fit:0')
  })

  it('stores an entry too long to fit on its own without its detail', () => {
    const logger = reload({ maxStoredLength: 1000 })
    logger.info('cart', 'small:before')
    logger.info('cart', 'huge', 'x'.repeat(2000))
    leavePage()
    const entries = reload().getEntries()
    expect(entries.at(-1)).toEqual({
      timestamp: expect.any(String),
      scope: 'cart',
      action: 'huge',
      detail: '[Omitted: too long to store]',
    })
    // Not pushed out by the entry that was too long.
    expect(entries.map(({ action }) => action)).toContain('small:before')
  })

  it('logs to memory where there is no document, as on a server', () => {
    vi.stubGlobal('document', undefined)
    const logger = reload()
    logger.info('app', 'server:render')
    expect(logger.getEntries().at(-1)).toMatchObject({
      action: 'server:render',
    })
  })
})
