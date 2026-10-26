/**
 * @fileoverview Turning any value into one that saves to JSON as it was
 * logged.
 */

import { isError, mapValues, pick } from 'es-toolkit'

/**
 * What an `Error` holds that a spread leaves out, being inherited or
 * non-enumerable.
 */
export const errorFields = (
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

/** `toLoggable`, tracking the objects it is inside of to tell a loop apart. */
const copyLoggable = (value: unknown, ancestors: WeakSet<object>): unknown => {
  if (typeof value !== 'object' || value === null) return value
  if (ancestors.has(value)) return '[Circular]'
  // Dates, URLs, and the like say for themselves how they save.
  if ('toJSON' in value && typeof value.toJSON === 'function') {
    return value.toJSON()
  }
  ancestors.add(value)
  const copy = Array.isArray(value)
    ? value.map((item) => copyLoggable(item, ancestors))
    : mapValues(
        { ...value, ...(isError(value) && errorFields(value)) },
        (item) => copyLoggable(item, ancestors)
      )
  // Only an ancestor is circular: the same object twice side by side is not.
  ancestors.delete(value)
  return copy
}

/**
 * A copy of `value` as JSON will save it, with any `Error` in it spelled out
 * (one serializes to `{}` otherwise) and circular references cut.
 *
 * An `Error` keeps its own fields, such as `code`, beside its `name`,
 * `message`, `stack`, `cause`, and `errors`. A loop is cut to `'[Circular]'`,
 * while an object that only appears twice is kept both times.
 */
export const toLoggable = (value: unknown): unknown =>
  copyLoggable(value, new WeakSet())
