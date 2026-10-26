/**
 * @fileoverview Turning any value into one that saves to JSON as it was
 * logged.
 */

import { serializeError } from 'serialize-error'

/**
 * A copy of `value` as JSON will save it, with any `Error` in it spelled out
 * (one serializes to `{}` otherwise) and circular references cut.
 *
 * An `Error` keeps its own fields, such as `code`, beside its `name`,
 * `message`, `stack`, `cause`, and `errors`. A loop is cut to `'[Circular]'`,
 * while an object that only appears twice is kept both times.
 */
export const toLoggable = (value: unknown): unknown =>
  // `serializeError` wraps a bare primitive in a `NonError`, so one passes
  // through here as it is.
  typeof value === 'object' && value !== null ? serializeError(value) : value
