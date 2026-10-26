# local-logger — Claude Code Reference

A persistent on-device log for browser diagnostics reports, with optional React hooks, published to npm as `local-logger`.

## Code conventions

Conventions live outside this file, synced from https://github.com/bvandrc/bvandrc-conventions by `.github/workflows/sync-conventions.yml` — follow all of them, and edit a rule upstream rather than in `conventions/`, which every sync overwrites:

@conventions/typescript.md — language-level TypeScript/JavaScript rules
@conventions/react.md — component, JSX, folder layout, and accessibility rules
@conventions/ts-testing-all.md — testing rules shared by every TypeScript suite: test IDs, naming, assertions
@conventions/ts-unit-testing.md — TypeScript unit test layout, naming, fixtures, and assertions
@conventions/all.md — practice for every repo: branches, formatting, comments, testing, markdown, PR reviews

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm run build` | Build `dist/` with tsdown: unbundled ESM plus `.d.mts` types |
| `pnpm run format` | Biome format — **run before every commit** |
| `pnpm run lint` | Biome lint and format check |
| `pnpm run ts:check` | TypeScript check |
| `pnpm run test` | Vitest unit tests (single run) |
| `pnpm run check` | ts + lint (lint includes the format check); `prepublishOnly` runs it, then `test` and `build` |

## Releasing

Bump `version` in `package.json`, merge, then publish a GitHub release tagged `v<version>`. `.github/workflows/release.yml` checks the tag matches and runs `pnpm publish` with provenance.

## Gotchas

- **The core needs no React**: `src/local-logger.ts` and everything it imports must stay free of React, which is only an optional peer. React code goes in `src/local-logger-react.ts`, published as `local-logger/react`.
- **No dependencies**: Anything added to `dependencies` ships to every consumer of a package whose pitch is having none. A helper from `@bvandrc/react-ui-hooks` comes in as a dev dependency instead, which the build inlines into `dist/` (as `onAppLeave` is). `tsdown.config.ts`'s `deps.onlyBundle` and `deps.onlyImport` fail the build if anything else is bundled, or if the output imports anything but React.
- **The public API is `src/index.ts` and `src/local-logger-react.ts`**: Removing or renaming an export from either is a breaking change.
- **The stored shape is an API too**: A newer version reads what an older one wrote to `localStorage`, so a change to `LogEntry` has to keep reading entries without it.
- **Cases in a file share its state**: each file runs isolated, but the cases inside one share its document and modules. `vitest.setup.ts` clears `localStorage` and fake timers after every case, but a `vi.spyOn` or a module's own state is the test's to undo, and a `LocalLogger` built in a case keeps listening for `pagehide` for the rest of its file.
- **pnpm, pinned**: `packageManager` in `package.json` pins the pnpm version, which `corepack enable` (or CI's `pnpm/action-setup`) picks up. Install with `pnpm install`; npm and its `package-lock.json` aren't used here.
