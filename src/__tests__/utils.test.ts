import { toLoggable } from '../utils'

describe('toLoggable', () => {
  it('spells out an Error at any depth, with its cause and own fields', () => {
    const CAUSE = new RangeError('inner')
    const ERROR = Object.assign(new TypeError('outer', { cause: CAUSE }), {
      code: 'E_FETCH',
    })
    expect(toLoggable({ attempts: [ERROR] })).toEqual({
      attempts: [
        {
          code: 'E_FETCH',
          name: 'TypeError',
          message: 'outer',
          stack: ERROR.stack,
          cause: { name: 'RangeError', message: 'inner', stack: CAUSE.stack },
        },
      ],
    })
  })

  it('cuts a loop to [Circular], through objects and arrays alike', () => {
    const VALUE: Record<string, unknown> = { id: 1 }
    VALUE.self = VALUE
    VALUE.list = [{ parent: VALUE }]
    expect(toLoggable(VALUE)).toEqual({
      id: 1,
      self: '[Circular]',
      list: [{ parent: '[Circular]' }],
    })
  })

  it('keeps an object that appears twice, but not in a loop, both times', () => {
    const SHARED = { id: 7 }
    expect(toLoggable({ first: SHARED, second: SHARED })).toEqual({
      first: { id: 7 },
      second: { id: 7 },
    })
  })

  it('saves anything with a toJSON as that gives it, at any depth', () => {
    class Money {
      constructor(readonly cents: number) {}
      toJSON() {
        return (this.cents / 100).toFixed(2)
      }
    }
    expect(toLoggable(new Money(500))).toBe('5.00')
    expect(toLoggable({ at: new Date(0), price: new Money(1999) })).toEqual({
      at: '1970-01-01T00:00:00.000Z',
      price: '19.99',
    })
  })

  it('passes a primitive through as it is', () => {
    for (const VALUE of ['text', 7, true, null, undefined]) {
      expect(toLoggable(VALUE), String(VALUE)).toBe(VALUE)
    }
  })
})
