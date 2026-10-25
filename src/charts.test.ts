import { describe, expect, it } from 'vitest'
import { ACCOMPLISHMENT_TO_DATE, PAYMENT_DONUT_GRAPHIC_Z, paymentDonutRadius } from './charts'

describe('payment donut layout', () => {
  it('keeps enough center space for all summary text in a narrow chart', () => {
    expect(paymentDonutRadius(300)).toEqual(['42%', '58%'])
    expect(PAYMENT_DONUT_GRAPHIC_Z).toBeGreaterThan(2)
  })

  it('uses the requested accomplishment label', () => {
    expect(ACCOMPLISHMENT_TO_DATE).toBe('Accomplishment to Date')
  })
})
