import { expect, test } from 'claude-code/testing'
import { cacheView, cleanHandoff, normCwd, shouldWarnCache } from './lib'

test('cacheView: cold, fresh, warning and expired', () => {
  const p = { ttlMin: 60, warnMin: 10 }
  expect(cacheView({ lastApiAt: null, ctxPercent: null, now: 0 }, p).text).toBe('cold')
  expect(cacheView({ lastApiAt: 0, ctxPercent: null, now: 20 * 60_000 }, p).text).toBe('40m left')
  expect(cacheView({ lastApiAt: 0, ctxPercent: null, now: 55 * 60_000 }, p).needs).toBe(true)
  expect(cacheView({ lastApiAt: 0, ctxPercent: null, now: 61 * 60_000 }, p).isExpired).toBe(true)
})

test('shouldWarnCache fires once per fill', () => {
  expect(shouldWarnCache(5 * 60_000, 10 * 60_000, null, 100)).toBe(true)
  expect(shouldWarnCache(5 * 60_000, 10 * 60_000, 100, 100)).toBe(false)
  expect(shouldWarnCache(0, 10 * 60_000, null, 100)).toBe(false)
})

test('cleanHandoff strips escapes and control characters', () => {
  expect(cleanHandoff('\x1b[31mred\x1b[0m\x07 ok')).toBe('red ok')
})

test('normCwd folds slashes and case', () => {
  expect(normCwd('C:\\Dev\\App\\')).toBe('c:/dev/app')
})
