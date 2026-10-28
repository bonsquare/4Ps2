import { describe, expect, it } from 'vitest'
import { ACCOMPLISHMENT_TO_DATE, dailySeriesForMonth, formatPaymentShare, isNarrowPaymentChart, monthRangeNote, PAYMENT_DONUT_GRAPHIC_Z, PAYMENT_DONUT_LABEL_LAYOUT, PAYMENT_DONUT_LABEL_PLACEMENT, PAYMENT_DONUT_MIN_LABEL_ANGLE, paymentDonutLabelLine, paymentDonutLabelOffset, paymentDonutRadius } from './charts'

describe('daily accomplishment coverage month', () => {
  it('shows every calendar day in the selected month and zero-fills missing dates', () => {
    const series = dailySeriesForMonth({ '2026-02-03': 4, '2026-03-01': 99 }, '2026-02')

    expect(series).toHaveLength(28)
    expect(series[0]).toEqual(['Sun\nFeb 1', 0])
    expect(series[2]).toEqual(['Tue\nFeb 3', 4])
    expect(series[27]).toEqual(['Sat\nFeb 28', 0])
  })

  it('supports leap-year coverage months', () => {
    expect(dailySeriesForMonth({}, '2024-02')).toHaveLength(29)
  })

  it('summarizes only the selected month without mixing in other dates', () => {
    expect(monthRangeNote({ '2026-09-30': 7, '2026-10-01': 2, '2026-10-31': 3 }, '2026-10'))
      .toBe('Oct 1 – Oct 31: 5')
  })
})

describe('payment donut layout', () => {
  it('makes the donut prominent at both laptop and wide-desktop sizes', () => {
    expect(paymentDonutRadius(380)).toEqual(['40%', '58%'])
    expect(paymentDonutRadius(480)).toEqual(['44%', '66%'])
    expect(PAYMENT_DONUT_GRAPHIC_Z).toBeGreaterThan(2)
  })

  it('shortens leader lines when horizontal chart space is limited', () => {
    expect(isNarrowPaymentChart(380)).toBe(true)
    expect(isNarrowPaymentChart(480)).toBe(false)
    expect(paymentDonutLabelLine(380)).toEqual({ length: 12, length2: 8 })
    expect(paymentDonutLabelLine(480)).toEqual({ length: 18, length2: 10 })
  })

  it('keeps outside percentage labels close to their donut slices', () => {
    expect(PAYMENT_DONUT_LABEL_LAYOUT).toEqual({ alignTo: 'labelLine', bleedMargin: 4, overflow: 'none' })
    expect(PAYMENT_DONUT_LABEL_PLACEMENT).toEqual({ moveOverlap: 'shiftY', hideOverlap: false })
    expect(PAYMENT_DONUT_MIN_LABEL_ANGLE).toBe(0)
    expect(paymentDonutLabelOffset(0.32)).toBe(-14)
    expect(paymentDonutLabelOffset(1.72)).toBe(0)
    expect(paymentDonutLabelOffset(11.34)).toBe(12)
    expect(paymentDonutLabelOffset(27.43)).toBe(0)
    expect(formatPaymentShare(16.48)).toBe('16.48%')
    expect(formatPaymentShare(66.02)).toBe('66.02%')
    expect(formatPaymentShare(1.4)).toBe('1.40%')
  })

  it('uses the requested accomplishment label', () => {
    expect(ACCOMPLISHMENT_TO_DATE).toBe('Accomplishment to Date')
  })
})
