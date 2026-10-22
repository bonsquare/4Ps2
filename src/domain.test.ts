import { describe, expect, it } from 'vitest'
import { aggregateProvinces, filterDailySeries, provinceIsAllowed } from './domain'

describe('aggregateProvinces', () => {
  it('computes totals and percentage without double-counting provinces', () => {
    const result = aggregateProvinces([
      { id: 'sur', name: 'Davao del Sur', target: 100, accomplished: 75, today: 8 },
      { id: 'norte', name: 'Davao del Norte', target: 200, accomplished: 110, today: 12 },
    ])
    expect(result).toEqual({ target: 300, accomplished: 185, remaining: 115, percentage: 61.7, today: 20 })
  })

  it('returns no percentage when the target is unavailable', () => {
    expect(aggregateProvinces([{ id: 'x', name: 'X', target: 0, accomplished: 4, today: 1 }]).percentage).toBeNull()
  })
})

describe('filterDailySeries', () => {
  it('keeps inclusive dates in the requested range', () => {
    const rows = [
      { date: '2026-10-19', value: 5 },
      { date: '2026-10-20', value: 7 },
      { date: '2026-10-21', value: 9 },
    ]
    expect(filterDailySeries(rows, '2026-10-20', '2026-10-21')).toEqual(rows.slice(1))
  })
})

describe('provinceIsAllowed', () => {
  it('prevents a provincial account from requesting another province', () => {
    expect(provinceIsAllowed({ role: 'provincial', provinceId: 'sur' }, 'norte')).toBe(false)
    expect(provinceIsAllowed({ role: 'provincial', provinceId: 'sur' }, 'sur')).toBe(true)
    expect(provinceIsAllowed({ role: 'regional' }, 'norte')).toBe(true)
  })
})
