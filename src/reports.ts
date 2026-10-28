import { sortRecordsByValidatedDate, type ReviewRecord } from './sheets'

// Report scope: the whole region, one province, or one municipality of a province.
// Each report lists the next level down: provinces, then municipalities, then barangays.
export type ReportScope = { province?: string; municipality?: string }
// Date coverage: only beneficiaries validated on these days (inclusive, YYYY-MM-DD) count as Actual. Blank = all dates.
export type ReportCoverage = { from?: string; to?: string }

export type ReportRow = {
  name: string
  target: number
  actual: number
  remaining: number
  percent: number
  modes: Record<string, number>
}

export type Report = {
  level: 'Regional' | 'Provincial' | 'Municipal'
  childLabel: 'Province' | 'Municipality' | 'Barangay'
  rows: ReportRow[]
  total: ReportRow
  modes: string[] // payment modes found among validated beneficiaries, most used first
  modeShare: Array<{ mode: string; count: number; percent: number }>
}

export type PaymentInsights = {
  leadingMode: { name: string; count: number; percent: number }
  highestAccomplishment: { name: string; count: number }
  largestBacklog: { name: string; count: number }
  validatedPercent: number
  progressLabel: string
}

export type EnrollmentRow = {
  name: string
  enrolled: number
  notEnrolled: number
  total: number
  enrolledPercent: number
}

export type EnrollmentReport = {
  childLabel: 'Province' | 'Municipality' | 'Barangay'
  rows: EnrollmentRow[]
  total: EnrollmentRow
}

export type EnrollmentInsights = {
  enrolled: number
  notEnrolled: number
  highest: { name: string; count: number }
  enrollmentPercent: number
  progressLabel: string
}

const percentOf = (actual: number, target: number) => (target ? Math.round((actual / target) * 1000) / 10 : 0)
const clean = (value: string) => value.trim().replace(/\s+/g, ' ')

export const inScope = (record: ReviewRecord, scope: ReportScope) =>
  (!scope.province || record.province === scope.province) && (!scope.municipality || record.municipality === scope.municipality)

const validatedInCoverage = (record: ReviewRecord, coverage: ReportCoverage) => {
  if (!coverage.from && !coverage.to) return true
  const day = record.validatedDate ?? ''
  return !!day && (!coverage.from || day >= coverage.from) && (!coverage.to || day <= coverage.to)
}

export function buildReport(records: ReviewRecord[], scope: ReportScope, coverage: ReportCoverage = {}): Report {
  const scoped = records.filter((record) => inScope(record, scope))
  const childOf = (record: ReviewRecord) => (scope.municipality ? record.barangay : scope.province ? record.municipality : record.province)

  // Payment modes are matched ignoring case and spacing ("GCash" = "Gcash"), shown as first written.
  const labels = new Map<string, string>()
  const modeOf = (record: ReviewRecord) => {
    const mode = clean(record.paymentMode)
    if (!labels.has(mode.toLowerCase())) labels.set(mode.toLowerCase(), mode)
    return labels.get(mode.toLowerCase()) as string
  }

  const groups = new Map<string, ReportRow>()
  const total: ReportRow = { name: 'TOTAL', target: 0, actual: 0, remaining: 0, percent: 0, modes: {} }
  const add = (row: ReportRow, record: ReviewRecord) => {
    row.target += 1
    if (!record.accomplished || !validatedInCoverage(record, coverage)) return
    row.actual += 1
    const mode = modeOf(record)
    row.modes[mode] = (row.modes[mode] ?? 0) + 1
  }
  for (const record of scoped) {
    const name = clean(childOf(record)) || '(Not specified)'
    if (!groups.has(name)) groups.set(name, { name, target: 0, actual: 0, remaining: 0, percent: 0, modes: {} })
    add(groups.get(name) as ReportRow, record)
    add(total, record)
  }

  const rows = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
  for (const row of [...rows, total]) {
    row.remaining = row.target - row.actual
    row.percent = percentOf(row.actual, row.target)
  }
  const modes = Object.entries(total.modes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([mode]) => mode)
  return {
    level: scope.municipality ? 'Municipal' : scope.province ? 'Provincial' : 'Regional',
    childLabel: scope.municipality ? 'Barangay' : scope.province ? 'Municipality' : 'Province',
    rows,
    total,
    modes,
    modeShare: modes.map((mode) => ({ mode, count: total.modes[mode], percent: percentOf(total.modes[mode], total.actual) })),
  }
}

export function buildPaymentInsights(report: Report): PaymentInsights {
  const leadingMode = report.modeShare[0]
  const highest = report.rows.reduce<ReportRow | undefined>((best, row) => !best || row.actual > best.actual ? row : best, undefined)
  const backlog = report.rows.reduce<ReportRow | undefined>((best, row) => !best || row.remaining > best.remaining ? row : best, undefined)
  return {
    leadingMode: leadingMode
      ? { name: leadingMode.mode, count: leadingMode.count, percent: report.total.actual ? Math.round((leadingMode.count / report.total.actual) * 10000) / 100 : 0 }
      : { name: 'No validated mode yet', count: 0, percent: 0 },
    highestAccomplishment: highest && highest.actual
      ? { name: highest.name, count: highest.actual }
      : { name: 'No accomplishment yet', count: 0 },
    largestBacklog: backlog && backlog.remaining
      ? { name: backlog.name, count: backlog.remaining }
      : { name: 'No backlog', count: 0 },
    validatedPercent: report.total.percent,
    progressLabel: `${report.total.actual.toLocaleString('en-US')} of ${report.total.target.toLocaleString('en-US')} beneficiaries validated`,
  }
}

export function buildEnrollmentReport(records: ReviewRecord[], scope: ReportScope): EnrollmentReport {
  const childOf = (record: ReviewRecord) => (scope.municipality ? record.barangay : scope.province ? record.municipality : record.province)
  const groups = new Map<string, EnrollmentRow>()
  const total: EnrollmentRow = { name: 'TOTAL', enrolled: 0, notEnrolled: 0, total: 0, enrolledPercent: 0 }
  const add = (row: EnrollmentRow, status: 'enrolled' | 'not enrolled') => {
    if (status === 'enrolled') row.enrolled += 1
    else row.notEnrolled += 1
    row.total += 1
  }
  for (const record of records.filter((item) => inScope(item, scope))) {
    const name = clean(childOf(record)) || '(Not specified)'
    if (!groups.has(name)) groups.set(name, { name, enrolled: 0, notEnrolled: 0, total: 0, enrolledPercent: 0 })
    const status = clean(record.enrollmentStatus ?? '').toLowerCase()
    if (status !== 'enrolled' && status !== 'not enrolled') continue
    add(groups.get(name) as EnrollmentRow, status)
    add(total, status)
  }
  const rows = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
  for (const row of [...rows, total]) row.enrolledPercent = percentOf(row.enrolled, row.total)
  return {
    childLabel: scope.municipality ? 'Barangay' : scope.province ? 'Municipality' : 'Province',
    rows,
    total,
  }
}

export function buildEnrollmentInsights(report: EnrollmentReport): EnrollmentInsights {
  const highest = report.rows.reduce<EnrollmentRow | undefined>((best, row) => !best || row.enrolled > best.enrolled ? row : best, undefined)
  return {
    enrolled: report.total.enrolled,
    notEnrolled: report.total.notEnrolled,
    highest: highest && highest.enrolled ? { name: highest.name, count: highest.enrolled } : { name: 'No enrollment yet', count: 0 },
    enrollmentPercent: report.total.enrolledPercent,
    progressLabel: `${report.total.enrolled.toLocaleString('en-US')} of ${report.total.total.toLocaleString('en-US')} tagged beneficiaries enrolled`,
  }
}

// Names to print under a report: validated beneficiaries only, or everyone in scope.
export function beneficiaryList(records: ReviewRecord[], scope: ReportScope, include: 'validated' | 'all', coverage: ReportCoverage = {}) {
  return sortRecordsByValidatedDate(records
    .filter((record) => inScope(record, scope) && (include === 'all' || (record.accomplished && validatedInCoverage(record, coverage))))
  )
}
