import { renderHook } from '@testing-library/react'

import { LocalLogger } from '../persistent-logger'
import { createLocalLogger, getLoggerHooks } from '../persistent-logger-react'

/** The log every hook case writes to, kept apart from the core suite's. */
const {
  logger: hookLog,
  useLogDuration,
  useLogOnChange,
  useLogOnce,
} = createLocalLogger({ storageKey: 'test-local-log-hooks' })

/**
 * What a hook logged under `action` -- one name per case, since the cases
 * share the log and its cap can drop an older match as a new one lands.
 */
const getEntries = (action: string) =>
  hookLog.getEntries().filter((entry) => entry.action === action)

/** What `useLogDuration` logged for `action`, oldest first. */
const getSpanEntries = (action: string) =>
  hookLog.getEntries().filter((entry) => entry.action.startsWith(`${action}:`))

describe('useLogDuration', () => {
  /** Renders the hook, returning a way to flip `active`. */
  const renderSpan = (action: string, initiallyActive: boolean) => {
    let active = initiallyActive
    const rendered = renderHook(() => useLogDuration('cart', action, active))
    const setActive = (next: boolean) => {
      active = next
      rendered.rerender()
    }
    return { ...rendered, setActive }
  }

  it('logs the start, then the end with how long it lasted', () => {
    const ACTION = 'span:flips'
    const { setActive } = renderSpan(ACTION, true)
    expect(getSpanEntries(ACTION)).toEqual([
      expect.objectContaining({ scope: 'cart', action: `${ACTION}:start` }),
    ])
    setActive(false)
    expect(getSpanEntries(ACTION).at(-1)).toMatchObject({
      scope: 'cart',
      action: `${ACTION}:end`,
      detail: { ms: expect.any(Number) },
    })
  })

  it('logs nothing while inactive', () => {
    const ACTION = 'span:inactive'
    renderSpan(ACTION, false)
    expect(getSpanEntries(ACTION)).toHaveLength(0)
  })

  it('logs the end when unmounted mid-span', () => {
    const ACTION = 'span:unmounted'
    const { unmount } = renderSpan(ACTION, true)
    unmount()
    expect(getSpanEntries(ACTION).at(-1)).toMatchObject({
      action: `${ACTION}:end`,
    })
  })
})

describe('useLogOnChange', () => {
  /** Renders the hook, returning a way to change the value. */
  const renderOnChange = (action: string, initialValue: string) => {
    let value = initialValue
    const rendered = renderHook(() => useLogOnChange('auth', action, value))
    const setValue = (next: string) => {
      value = next
      rendered.rerender()
    }
    return { ...rendered, setValue }
  }

  it('logs the value on mount and on each change', () => {
    const ACTION = 'change:logsEach'
    const { setValue } = renderOnChange(ACTION, 'guest')
    setValue('auth-1')
    expect(getEntries(ACTION).map(({ detail }) => detail)).toEqual([
      'guest',
      'auth-1',
    ])
  })

  it('logs nothing more when re-rendered with the same value', () => {
    const ACTION = 'change:sameValue'
    const { setValue } = renderOnChange(ACTION, 'guest')
    setValue('guest')
    expect(getEntries(ACTION)).toHaveLength(1)
  })
})

describe('useLogOnce', () => {
  /** Renders the hook, returning a way to change `when` and the count. */
  const renderOnce = (action: string, initiallyWhen: boolean) => {
    let when = initiallyWhen
    let count = 1
    const rendered = renderHook(() =>
      useLogOnce('cart', action, when, { count })
    )
    const update = (next: { when?: boolean; count?: number }) => {
      when = next.when ?? when
      count = next.count ?? count
      rendered.rerender()
    }
    return { ...rendered, update }
  }

  it('logs once the condition first holds, with the detail of that render', () => {
    const ACTION = 'once:firstHolds'
    const { update } = renderOnce(ACTION, false)
    expect(getEntries(ACTION)).toHaveLength(0)
    update({ when: true, count: 3 })
    expect(getEntries(ACTION)).toEqual([
      expect.objectContaining({ scope: 'cart', detail: { count: 3 } }),
    ])
  })

  it('logs nothing more while mounted, whatever changes', () => {
    const ACTION = 'once:staysOnce'
    const { update } = renderOnce(ACTION, true)
    update({ count: 5 })
    update({ when: false })
    update({ when: true })
    expect(getEntries(ACTION)).toHaveLength(1)
  })
})

describe('getLoggerHooks', () => {
  it('logs to the logger it was given', () => {
    const logger = new LocalLogger({ storageKey: 'test-local-log-given' })
    const { useLogOnce: useLogOnceToGiven } = getLoggerHooks(logger)
    renderHook(() => useLogOnceToGiven('cart', 'given:once', true))
    expect(logger.getEntries()).toEqual([
      expect.objectContaining({ scope: 'cart', action: 'given:once' }),
    ])
  })
})
