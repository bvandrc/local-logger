/**
 * @fileoverview A log kept on the device, for production diagnostics.
 * Captures timestamped action logs in a capped buffer kept in localStorage, so
 * a report still covers what happened before a reload, an app update, or the
 * app being closed and reopened.
 */

// A dev dependency, inlined by the build -- see `tsdown.config.ts`.
import { onAppLeave } from '@bvandrc/react-ui-hooks'
import { isError, sortBy, takeRightWhile } from 'es-toolkit'
import { serializeError } from 'serialize-error'

import { toLoggable } from './utils'

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

export interface PersistentLoggerOptions {
  /** The localStorage key the log persists under. Must not be empty. */
  storageKey: string
  /**
   * How many entries to keep, newest first.
   *
   * Must be a positive integer: the constructor throws a `RangeError` otherwise.
   *
   * @default 300
   */
  maxEntries?: number
  /**
   * How long the stored log may grow, in characters of its JSON.
   *
   * The oldest entries go first, and an entry too long to fit on its own is
   * stored with its `detail` replaced by `'[Omitted: too long to store]'`. The
   * default is a tenth of what browsers commonly give an origin's
   * localStorage. Must be a positive integer: the constructor throws a
   * `RangeError` otherwise.
   *
   * @default 500_000
   */
  maxStoredLength?: number
}

/** The newest of `entries`, as one JSON array no longer than `maxLength`. */
const serializeNewest = (entries: LogEntry[], maxLength: number) => {
  // The array is joined by hand rather than serialized again, so the length
  // counted is the length written.
  const fits = (serialized: string) => serialized.length + 2 <= maxLength
  const fitting = entries
    .map((entry) => {
      const serialized = JSON.stringify(entry)
      // Too long on its own, with the brackets: its `detail` is dropped, so it
      // can't push out everything older, and it's skipped if that still won't
      // fit.
      return fits(serialized)
        ? serialized
        : JSON.stringify({ ...entry, detail: '[Omitted: too long to store]' })
    })
    .filter(fits)
  // The opening bracket, then each entry with the comma or closing bracket
  // after it.
  let length = 1
  const kept = takeRightWhile(fitting, (serialized) => {
    length += serialized.length + 1
    return length <= maxLength
  })
  return `[${kept.join(',')}]`
}

/** Throws a `RangeError` unless the option `name` is a positive integer. */
const assertPositiveInteger = (name: string, value: number) => {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`)
  }
}

export class PersistentLogger<Scope extends string = string> {
  /** The localStorage key the log persists under. */
  readonly storageKey: string
  /** How many entries the log keeps, with the default filled in. */
  readonly maxEntries: number
  /** How long the stored log may grow, with the default filled in. */
  readonly maxStoredLength: number
  /**
   * Logged since this page last wrote to storage. Storage itself is read only
   * when a report or a write needs it, so app load parses nothing.
   */
  private unsavedEntries: LogEntry[] = []

  constructor({
    storageKey,
    maxEntries = 300,
    maxStoredLength = 500_000,
  }: PersistentLoggerOptions) {
    if (storageKey.length === 0) {
      throw new RangeError('storageKey must not be empty')
    }
    assertPositiveInteger('maxEntries', maxEntries)
    assertPositiveInteger('maxStoredLength', maxStoredLength)
    this.storageKey = storageKey
    this.maxEntries = maxEntries
    this.maxStoredLength = maxStoredLength
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
   * Logs a caught error, along with any `extra` details.
   *
   * An `Error` is saved as its `name`, `message`, `stack`, and `cause`, plus any
   * fields of its own, like `code`. Anything else that was thrown is saved as
   * it is, under `thrown`.
   */
  error(
    scope: Scope,
    action: string,
    error: unknown,
    extra?: Record<string, unknown>
  ) {
    this.push('error', scope, action, {
      // Serialized here, not left to `push`'s `toLoggable`: an `Error`'s
      // `name`, `message`, and `stack` aren't enumerable, so spreading the
      // `Error` itself would drop them.
      ...(isError(error) ? serializeError(error) : { thrown: error }),
      ...extra,
    })
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
      this.unsavedEntries = this.unsavedEntries.slice(-this.maxEntries)
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
    // Tabs append in the order they write, not the order they logged in.
    // ISO timestamps sort as strings, and the sort is stable for ties.
    return sortBy([...stored, ...this.unsavedEntries], ['timestamp']).slice(
      -this.maxEntries
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
      localStorage.setItem(
        this.storageKey,
        serializeNewest(this.getEntries(), this.maxStoredLength)
      )
      // Written now, so the next write must not append them again. Only on
      // success: a failed write keeps them for the next try.
      this.unsavedEntries = []
    } catch {
      // Storage full or blocked: the log must never be what breaks the app.
    }
  }
}
