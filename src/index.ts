// biome-ignore-all lint/performance/noBarrelFile: a package entry point is a
// barrel by definition -- it is what `exports` resolves to.

export * from './local-logger'
// Not './utils/page': its helper is internal to the logger, not part of the API.
