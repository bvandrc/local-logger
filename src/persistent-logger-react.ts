/**
 * @fileoverview React hooks that log to a `PersistentLogger`, published as the
 * package's `/react` entry so the core needs no React.
 */

import { useEffect, useRef } from 'react'

import {
  PersistentLogger,
  type PersistentLoggerOptions,
} from './persistent-logger'

/** React hooks that log to `logger`. */
export const getLoggerHooks = <Scope extends string>(
  logger: PersistentLogger<Scope>
) => ({
  /**
   * Logs `<action>:start` when `active` turns true, and `<action>:end` with the
   * milliseconds it lasted when it turns false or the caller unmounts.
   */
  useLogDuration: (scope: Scope, action: string, active: boolean) => {
    useEffect(() => {
      if (!active) return
      const startedAt = performance.now()
      logger.info(scope, `${action}:start`)
      return () =>
        logger.info(scope, `${action}:end`, {
          ms: Math.round(performance.now() - startedAt),
        })
    }, [scope, action, active])
  },

  /**
   * Logs `action` with `value` on mount, and again whenever `value` changes.
   *
   * Compared by identity, like an effect's deps, so pass a primitive or a
   * stable reference: an object built inline would log on every render.
   */
  useLogOnChange: (scope: Scope, action: string, value: unknown) => {
    useEffect(() => {
      logger.info(scope, action, value)
    }, [scope, action, value])
  },

  /**
   * Logs `action` with `detail` the first render `when` is true, and never
   * again for as long as the caller stays mounted.
   *
   * `detail` is read as it stands on that render, so it can be built inline.
   */
  useLogOnce: (
    scope: Scope,
    action: string,
    when: boolean,
    detail?: unknown
  ) => {
    const hasLoggedRef = useRef(false)
    // Read through a ref, so a fresh `detail` object every render doesn't
    // re-run the effect.
    const detailRef = useRef(detail)
    detailRef.current = detail

    useEffect(() => {
      if (!when || hasLoggedRef.current) return
      hasLoggedRef.current = true
      logger.info(scope, action, detailRef.current)
    }, [scope, action, when])
  },
})

/** A new `PersistentLogger`, alongside the React hooks that log to it. */
export const createPersistentLogger = <Scope extends string = string>(
  options: PersistentLoggerOptions
) => {
  const logger = new PersistentLogger<Scope>(options)
  return { logger, ...getLoggerHooks(logger) }
}
