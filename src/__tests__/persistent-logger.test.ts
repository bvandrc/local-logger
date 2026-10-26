import { type LogEntry, PersistentLogger } from '../persistent-logger'

const STORAGE_KEY = 'test-log'

/** A logger as a page load gets one, persisting under `STORAGE_KEY`. */
const createLogger = () => new PersistentLogger({ storageKey: STORAGE_KEY })

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

describe('PersistentLogger logToConsole', () => {
  const echoLog = new PersistentLogger({
    storageKey: 'test-log-echo',
    logToConsole: true,
  })

  /** Spies on the console method `level` echoes to, keeping it quiet. */
  const mockConsole = (level: 'info' | 'warn' | 'error') =>
    vi.spyOn(console, level).mockReturnValue(undefined)

  it('echoes each level to its console method', () => {
    const consoleSpies = {
      info: mockConsole('info'),
      warn: mockConsole('warn'),
      error: mockConsole('error'),
    }
    const ERROR = new Error('offline')
    echoLog.info('cart', 'echo:info', { id: 1 })
    echoLog.warn('cart', 'echo:warn')
    echoLog.error('sync', 'echo:error', ERROR, { attempt: 2 })
    const calls = {
      info: consoleSpies.info.mock.calls,
      warn: consoleSpies.warn.mock.calls,
      error: consoleSpies.error.mock.calls,
    }
    for (const spy of Object.values(consoleSpies)) spy.mockRestore()
    expect(calls).toEqual({
      info: [['[cart] echo:info', { id: 1 }]],
      // No detail given, so none echoed.
      warn: [['[cart] echo:warn']],
      // The Error itself, not its saved copy.
      error: [['[sync] echo:error', ERROR, { attempt: 2 }]],
    })
  })

  it('echoes nothing by default', () => {
    const infoSpy = mockConsole('info')
    localLog.info('cart', 'echo:off')
    const callCount = infoSpy.mock.calls.length
    infoSpy.mockRestore()
    expect(callCount).toBe(0)
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

  it('saves an error without waiting for the page to hide', async () => {
    reload().error('sync', 'save:failed', new Error('offline'))
    await Promise.resolve()
    expect(reload().getEntries()).toContainEqual(
      expect.objectContaining({ level: 'error', action: 'save:failed' })
    )
  })

  it('saves errors logged together in one write', async () => {
    const logger = reload()
    const setItemSpy = vi.spyOn(localStorage, 'setItem')
    for (const ACTION of ['burst:1', 'burst:2', 'burst:3']) {
      logger.error('sync', ACTION, new Error('offline'))
    }
    await Promise.resolve()
    const writtenKeys = setItemSpy.mock.calls.map(([key]) => key)
    setItemSpy.mockRestore()
    expect(writtenKeys).toEqual([STORAGE_KEY])
  })

  it('leaves info and warn unsaved until the page hides', async () => {
    const logger = reload()
    logger.info('cart', 'unsaved:info')
    logger.warn('cart', 'unsaved:warn')
    await Promise.resolve()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
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

  it('logs to memory where there is no document, as on a server', () => {
    vi.stubGlobal('document', undefined)
    const logger = reload()
    logger.info('app', 'server:render')
    expect(logger.getEntries().at(-1)).toMatchObject({
      action: 'server:render',
    })
  })
})
