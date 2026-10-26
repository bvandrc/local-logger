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

  it('passes a primitive through as it is', () => {
    for (const VALUE of ['text', 7, true, null, undefined]) {
      expect(toLoggable(VALUE), String(VALUE)).toBe(VALUE)
    }
  })
})
