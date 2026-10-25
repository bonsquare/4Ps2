export const ACCOMPLISHMENT_TO_DATE = 'Accomplishment to Date'
export const PAYMENT_DONUT_GRAPHIC_Z = 10

export function paymentDonutRadius(width: number): [string, string] {
  return width < 360 ? ['38%', '50%'] : ['42%', '60%']
}

export function paymentDonutLabelLine(width: number) {
  return width < 360 ? { length: 6, length2: 3 } : { length: 10, length2: 6 }
}
