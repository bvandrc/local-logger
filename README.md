# local-logger

A persistent on-device log for browser diagnostics reports. It's kept in `localStorage`, so a report still covers what happened before a reload, an app update, or a phone killing a backgrounded tab. Framework-agnostic, with optional React hooks.

```bash
npm install local-logger
```

ESM only, with types included. Its dependencies are [es-toolkit](https://es-toolkit.dev) and [serialize-error](https://github.com/sindresorhus/serialize-error); React 18 or 19 is an optional peer, needed only for `local-logger/react`.

## Usage

```ts
import { LocalLogger } from 'local-logger'

type Scope = 'api' | 'auth' | 'sync'

export const log = new LocalLogger<Scope>({ storageKey: 'my-app-log' })

log.info('auth', 'signIn', { method: 'google' })
log.warn('sync', 'retry', { attempt: 3 })
fetchItems().catch(log.catchTo('api', 'items.list:failed'))

// Later, for a "send diagnostics" button:
const report = JSON.stringify(log.getEntries(), null, 2)
```

Logging only appends to memory. The log is written to storage when the page is hidden or unloads, and read back only when `getEntries` asks for it, so app load parses nothing and a busy log costs no storage writes.

## API

### `new LocalLogger<Scope>(options)`

| Option | Default | What it does |
| --- | --- | --- |
| `storageKey` | (required) | The `localStorage` key the log persists under. Must not be empty. |
| `maxEntries` | `300` | How many entries to keep; the oldest go first. Must be a positive integer. |

| Method | What it does |
| --- | --- |
| `info(scope, action, detail?)` | Logs an entry. |
| `warn(scope, action, detail?)` | Logs an entry at `warn`. |
| `error(scope, action, error, extra?)` | Logs a failure at `error`, with the thrown value spelled out beside `extra`: an `Error`'s `name`, `message`, `stack`, `cause`, and own fields such as `code`, or a non-Error as its string `message`. |
| `catchTo(scope, action)` | A `.catch` handler that logs the rejection via `error` and swallows it. |
| `withScope(scope)` | The same four methods with `scope` already filled in, for a module that logs under one scope throughout. |
| `getEntries()` | Every entry still kept, across sessions and tabs, oldest first. |
| `clear()` | Empties the log, both what's stored and what this page hasn't saved yet. |

Each entry is a `LogEntry`: `{ timestamp, level?, scope, action, detail? }`, where `timestamp` is an ISO string and `level` is left out at `info`, so only the levels worth noticing show. A `detail` is copied as it's logged, with any `Error` in it spelled out the same way (JSON alone makes one `{}`) and any circular reference saved as `'[Circular]'`.

Saving runs on `visibilitychange` to hidden as well as `pagehide`, since a phone can kill a backgrounded app without `pagehide` ever firing. Each save re-reads storage first, so tabs open at once all keep what they logged.

### `toLoggable(value)`

A copy of `value` as JSON will save it, which the logger runs every `detail` through, built on `serialize-error`. An `Error` at any depth is spelled out with its `name`, `message`, `stack`, `cause`, `errors`, and own fields such as `code`, where JSON alone makes it `{}`. A loop is cut to `'[Circular]'`, and anything with a `toJSON`, like a `Date`, saves as that gives it. Useful for a report built outside the logger:

```ts
import { toLoggable } from 'local-logger'

JSON.stringify(toLoggable({ failed: new TypeError('offline') }))
```

## React

```ts
import { createLocalLogger } from 'local-logger/react'

export const { logger: log, useLogDuration, useLogOnChange, useLogOnce } =
  createLocalLogger<Scope>({ storageKey: 'my-app-log' })
```

`getLoggerHooks(logger)` gives the same hooks for a `LocalLogger` you already have.

| Hook | What it does |
| --- | --- |
| `useLogDuration(scope, action, active)` | Logs `<action>:start` when `active` turns true, and `<action>:end` with the milliseconds it lasted when it turns false or the component unmounts. |
| `useLogOnChange(scope, action, value)` | Logs `value` on mount and whenever it changes. Compared by identity, so pass a primitive or a stable reference. |
| `useLogOnce(scope, action, when, detail?)` | Logs once, the first render `when` is true, with `detail` as it stands on that render. |

## License

MIT
