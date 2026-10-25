export const ACCOMPLISHMENT_TO_DATE = 'Accomplishment to Date'
export const PAYMENT_DONUT_GRAPHIC_Z = 10

export function isNarrowPaymentChart(width: number) {
  return width < 420
}

export function paymentDonutRadius(width: number): [string, string] {
  return isNarrowPaymentChart(width) ? ['40%', '58%'] : ['44%', '66%']
}

export function paymentDonutLabelLine(width: number) {
  return isNarrowPaymentChart(width) ? { length: 8, length2: 4 } : { length: 10, length2: 6 }
}
