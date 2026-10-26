/**
 * @fileoverview A log kept on the device, for production diagnostics.
 * Captures timestamped action logs in a capped buffer kept in localStorage, so
 * a report still covers what happened before a reload, an app update, or the
 * app being closed and reopened.
 */

// A dev dependency, inlined by the build -- see `tsdown.config.ts`.
import { onAppLeave } from '@bvandrc/react-ui-hooks'
import { isError, mapValues, pick, sortBy, takeRight } from 'es-toolkit'

/** `info` is the default, and the one level an entry leaves unsaid. */
export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: string
  /** Left out at `info`, so only the levels worth noticing show. */
  level?: Exclude<LogLevel, 'info'>
  scope: string
  action: string
  detail?: unknown
}

export interface LocalLoggerOptions {
  /** The localStorage key the log persists under. */
  storageKey: string
  /**
   * How many entries to keep, newest first.
   *
   * Must be above 0: the constructor throws a `RangeError` otherwise.
   *
   * @default 300
   */
  maxEntries?: number
}

/**
 * What an `Error` holds that a spread leaves out, being inherited or
 * non-enumerable.
 */
const errorFields = (
  error: Error & Partial<Pick<AggregateError, 'errors'>>
) => ({
  // Read directly: `name` is inherited everywhere, and `stack` is in Firefox
  // and Safari, where `pick` (own properties only) would drop it.
  name: error.name,
  message: error.message,
  stack: error.stack,
  // Own properties when present, and absent rather than undefined otherwise.
  ...pick(error, ['cause', 'errors']),
})

/**
 * A copy of `value` as JSON will save it, with any `Error` in it spelled out
 * (one serializes to `{}` otherwise) and circular references cut.
 */
const toLoggable = (
  value: unknown,
  ancestors = new WeakSet<object>()
): unknown => {
  if (typeof value !== 'object' || value === null) return value
  if (ancestors.has(value)) return '[Circular]'
  // Dates, URLs, and the like say for themselves how they save.
  if ('toJSON' in value && typeof value.toJSON === 'function') {
    return value.toJSON()
  }
  ancestors.add(value)
  const copy = Array.isArray(value)
    ? value.map((item) => toLoggable(item, ancestors))
    : mapValues(
        { ...value, ...(isError(value) && errorFields(value)) },
        (item) => toLoggable(item, ancestors)
      )
  // Only an ancestor is circular: the same object twice side by side is not.
  ancestors.delete(value)
  return copy
}

export class LocalLogger<Scope extends string = string> {
  /** The localStorage key the log persists under. */
  readonly storageKey: string
  /** How many entries the log keeps, with the default filled in. */
  readonly maxEntries: number
  /**
   * Logged since this page last wrote to storage. Storage itself is read only
   * when a report or a write needs it, so app load parses nothing.
   */
  private unsavedEntries: LogEntry[] = []

  constructor({ storageKey, maxEntries = 300 }: LocalLoggerOptions) {
    // Negated, so `NaN`, which compares false either way, throws too.
    if (!(maxEntries > 0)) {
      throw new RangeError(`maxEntries must be above 0, got ${maxEntries}`)
    }
    this.storageKey = storageKey
    this.maxEntries = maxEntries
    // No page to leave while rendering on a server, and nothing to persist to.
    if (typeof document === 'undefined') return
    // Never unsubscribed: the logger lives as long as the page does.
    onAppLeave(() => this.persist())
  }

  info(scope: Scope, action: string, detail?: unknown) {
    this.push('info', scope, action, detail)
  }

  warn(scope: Scope, action: string, detail?: unknown) {
    this.push('warn', scope, action, detail)
  }

  /**
   * Logs a failure, with the thrown value spelled out beside `extra`: an
   * `Error`'s `name`, `message`, `stack`, `cause`, and own fields, or a non-Error
   * as its string `message`.
   */
  error(
    scope: Scope,
    action: string,
    error: unknown,
    extra?: Record<string, unknown>
  ) {
    const thrown = isError(error)
      ? { ...error, ...errorFields(error) }
      : { message: String(error) }
    this.push('error', scope, action, { ...thrown, ...extra })
  }

  /** A `.catch` handler that logs the rejection via `error` and swallows it. */
  catchTo(scope: Scope, action: string) {
    return (error: unknown) => this.error(scope, action, error)
  }

  private push(level: LogLevel, scope: Scope, action: string, detail: unknown) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      ...(level !== 'info' && { level }),
      scope,
      action,
      // Copied now, so it saves as it was when logged.
      detail: toLoggable(detail),
    }
    this.unsavedEntries.push(entry)
    if (this.unsavedEntries.length > this.maxEntries) {
      this.unsavedEntries = takeRight(this.unsavedEntries, this.maxEntries)
    }
  }

  /**
   * This logger with `scope` already filled in, for a module that logs under
   * one scope throughout.
   */
  withScope(scope: Scope) {
    return {
      info: (action: string, detail?: unknown) =>
        this.info(scope, action, detail),
      warn: (action: string, detail?: unknown) =>
        this.warn(scope, action, detail),
      error: (
        action: string,
        error: unknown,
        extra?: Record<string, unknown>
      ) => this.error(scope, action, error, extra),
      catchTo: (action: string) => this.catchTo(scope, action),
    }
  }

  /** Every entry still kept, across sessions and tabs, oldest first. */
  getEntries(): LogEntry[] {
    // Read fresh each time, so what another tab has written since is included.
    let stored: LogEntry[] = []
    try {
      const parsed: unknown = JSON.parse(
        localStorage.getItem(this.storageKey) ?? '[]'
      )
      // Anything else is a write this version can't read; start over.
      if (Array.isArray(parsed)) stored = parsed
    } catch {
      // Unparseable, or storage blocked: start over too.
    }
    return takeRight(
      // Tabs append in the order they write, not the order they logged in.
      // ISO timestamps sort as strings, and the sort is stable for ties.
      sortBy([...stored, ...this.unsavedEntries], ['timestamp']),
      this.maxEntries
    )
  }

  /** Empties the log, both what's stored and what this page hasn't saved yet. */
  clear() {
    this.unsavedEntries = []
    try {
      localStorage.removeItem(this.storageKey)
    } catch {
      // Storage blocked: there was nothing stored to clear.
    }
  }

  private persist() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.getEntries()))
      // Written now, so the next write must not append them again. Only on
      // success: a failed write keeps them for the next try.
      this.unsavedEntries = []
    } catch {
      // Storage full or blocked: the log must never be what breaks the app.
    }
  }
}
