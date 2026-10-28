export const ACCOMPLISHMENT_TO_DATE = 'Accomplishment to Date'
export const PAYMENT_DONUT_GRAPHIC_Z = 10
export const PAYMENT_DONUT_LABEL_LAYOUT = { alignTo: 'labelLine' as const, bleedMargin: 4, overflow: 'none' as const }
export const PAYMENT_DONUT_LABEL_PLACEMENT = { moveOverlap: 'shiftY' as const, hideOverlap: false }
export const PAYMENT_DONUT_MIN_LABEL_ANGLE = 0

function datesInMonth(month: string, today?: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return []
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const shownDays = today?.startsWith(`${month}-`) ? Math.min(count, Number(today.slice(8, 10))) : count
  return Array.from({ length: shownDays }, (_, index) => `${match[1]}-${match[2]}-${String(index + 1).padStart(2, '0')}`)
}

export function dailySeriesForMonth(values: Record<string, number>, month: string, today?: string): Array<[string, number]> {
  return datesInMonth(month, today).map((date) => {
    const day = new Date(`${date}T00:00:00Z`)
    const weekday = new Intl.DateTimeFormat('en-PH', { weekday: 'short', timeZone: 'UTC' }).format(day)
    const monthDay = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(day)
    return [`${weekday}\n${monthDay}`, values[date] ?? 0]
  })
}

export function monthRangeNote(values: Record<string, number>, month: string, today?: string) {
  const dates = datesInMonth(month, today)
  if (!dates.length) return ''
  const total = dates.reduce((sum, date) => sum + (values[date] ?? 0), 0)
  const label = (date: string) => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
  return `${label(dates[0])} – ${label(dates[dates.length - 1])}: ${total.toLocaleString('en-US')}`
}

export function formatPaymentShare(value: number) {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

export function isNarrowPaymentChart(width: number) {
  return width < 420
}

export function paymentDonutRadius(width: number): [string, string] {
  return isNarrowPaymentChart(width) ? ['40%', '58%'] : ['44%', '66%']
}

export function paymentDonutLabelLine(width: number) {
  return isNarrowPaymentChart(width) ? { length: 12, length2: 8 } : { length: 18, length2: 10 }
}

export function paymentDonutLabelOffset(percent: number) {
  if (percent < 1) return -14
  if (percent < 5) return 0
  if (percent < 15) return 12
  return 0
}
