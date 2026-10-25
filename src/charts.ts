export const ACCOMPLISHMENT_TO_DATE = 'Accomplishment to Date'
export const PAYMENT_DONUT_GRAPHIC_Z = 10
export const PAYMENT_DONUT_LABEL_LAYOUT = { alignTo: 'edge' as const, edgeDistance: 8, bleedMargin: 4 }

export function paymentDonutRadius(width: number): [string, string] {
  return width < 360 ? ['42%', '58%'] : ['42%', '60%']
}
