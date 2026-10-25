export const ACCOMPLISHMENT_TO_DATE = 'Accomplishment to Date'
export const PAYMENT_DONUT_GRAPHIC_Z = 10

export function paymentDonutRadius(width: number): [string, string] {
  return width < 360 ? ['42%', '58%'] : ['42%', '60%']
}
