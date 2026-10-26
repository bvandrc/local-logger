/**
 * @fileoverview A log kept on the device, for production diagnostics.
 * Captures timestamped action logs in a capped buffer kept in localStorage, so
 * a report still covers what happened before a reload, an app update, or the
 * app being closed and reopened.
 */

// A dev dependency, inlined by the build -- see `tsdown.config.ts`.
import { onAppLeave } from '@bvandrc/react-ui-hooks'

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
   * @default 300
   */
  maxEntries?: number
  /**
   * How long the stored log may grow, in characters of its JSON.
   *
   * The oldest entries go first, and an entry too long to fit on its own is
   * never stored. The default is a tenth of what browsers commonly give an
   * origin's localStorage.
   *
   * @default 500_000
   */
  maxStoredLength?: number
}

/** The newest of `entries`, as one JSON array no longer than `maxLength`. */
const serializeNewest = (entries: LogEntry[], maxLength: number) => {
  // Each entry is serialized once, and the array is joined by hand rather than
  // serialized again, so the length counted is the length written.
  // The array's brackets.
  let length = 2
  const kept: string[] = []
  for (let index = entries.length - 1; index >= 0; index--) {
    const serialized = JSON.stringify(entries[index])
    // One for the comma before every entry but the first.
    const added = serialized.length + (kept.length > 0 ? 1 : 0)
    // Too long on its own: skipped, so it can't push out everything older.
    if (serialized.length + 2 > maxLength) continue
    if (length + added > maxLength) break
    length += added
    kept.push(serialized)
  }
  return `[${kept.reverse().join(',')}]`
}

export class LocalLogger<Scope extends string = string> {
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

  /** Safe to call during server rendering, where it logs to memory only. */
  constructor({
    storageKey,
    maxEntries = 300,
    maxStoredLength = 500_000,
  }: LocalLoggerOptions) {
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
   * Logs a failure, with the thrown value spelled out as `message` and `stack`
   * (an `Error` serializes to `{}` in JSON) beside `extra`.
   */
  error(
    scope: Scope,
    action: string,
    error: unknown,
    extra?: Record<string, unknown>
  ) {
    const thrown =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
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
      detail,
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
    return (
      [...stored, ...this.unsavedEntries]
        // Tabs append in the order they write, not the order they logged in.
        // ISO timestamps sort as strings, and the sort is stable for ties.
        .sort((a, b) =>
          a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0
        )
        .slice(-this.maxEntries)
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
