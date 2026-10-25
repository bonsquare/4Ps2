import { describe, expect, it } from 'vitest'
import { ACCOMPLISHMENT_TO_DATE, formatPaymentShare, isNarrowPaymentChart, PAYMENT_DONUT_GRAPHIC_Z, PAYMENT_DONUT_LABEL_LAYOUT, paymentDonutLabelLine, paymentDonutRadius } from './charts'

describe('payment donut layout', () => {
  it('makes the donut prominent at both laptop and wide-desktop sizes', () => {
    expect(paymentDonutRadius(380)).toEqual(['40%', '58%'])
    expect(paymentDonutRadius(480)).toEqual(['44%', '66%'])
    expect(PAYMENT_DONUT_GRAPHIC_Z).toBeGreaterThan(2)
  })

  it('shortens leader lines when horizontal chart space is limited', () => {
    expect(isNarrowPaymentChart(380)).toBe(true)
    expect(isNarrowPaymentChart(480)).toBe(false)
    expect(paymentDonutLabelLine(380)).toEqual({ length: 8, length2: 4 })
    expect(paymentDonutLabelLine(480)).toEqual({ length: 10, length2: 6 })
  })

  it('keeps every outside percentage label within the chart canvas', () => {
    expect(PAYMENT_DONUT_LABEL_LAYOUT).toEqual({ alignTo: 'edge', edgeDistance: 8, bleedMargin: 4, overflow: 'none' })
    expect(formatPaymentShare(16.48)).toBe('16.5%')
    expect(formatPaymentShare(66.02)).toBe('66%')
  })

  it('uses the requested accomplishment label', () => {
    expect(ACCOMPLISHMENT_TO_DATE).toBe('Accomplishment to Date')
  })
})
