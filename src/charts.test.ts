import { describe, expect, it } from 'vitest'
import { ACCOMPLISHMENT_TO_DATE, PAYMENT_DONUT_GRAPHIC_Z, paymentDonutLabelLine, paymentDonutRadius } from './charts'

describe('payment donut layout', () => {
  it('keeps enough center space for all summary text in a narrow chart', () => {
    expect(paymentDonutRadius(300)).toEqual(['38%', '50%'])
    expect(PAYMENT_DONUT_GRAPHIC_Z).toBeGreaterThan(2)
  })

  it('shortens leader lines when horizontal chart space is limited', () => {
    expect(paymentDonutLabelLine(300)).toEqual({ length: 6, length2: 3 })
    expect(paymentDonutLabelLine(420)).toEqual({ length: 10, length2: 6 })
  })

  it('uses the requested accomplishment label', () => {
    expect(ACCOMPLISHMENT_TO_DATE).toBe('Accomplishment to Date')
  })
})
