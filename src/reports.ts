import type { ReviewRecord } from './sheets'

// Report scope: the whole region, one province, or one municipality of a province.
// Each report lists the next level down: provinces, then municipalities, then barangays.
export type ReportScope = { province?: string; municipality?: string }

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

const percentOf = (actual: number, target: number) => (target ? Math.round((actual / target) * 1000) / 10 : 0)
const clean = (value: string) => value.trim().replace(/\s+/g, ' ')

export const inScope = (record: ReviewRecord, scope: ReportScope) =>
  (!scope.province || record.province === scope.province) && (!scope.municipality || record.municipality === scope.municipality)

export function buildReport(records: ReviewRecord[], scope: ReportScope): Report {
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
    if (!record.accomplished) return
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

// Names to print under a report: validated beneficiaries only, or everyone in scope.
export function beneficiaryList(records: ReviewRecord[], scope: ReportScope, include: 'validated' | 'all') {
  return records
    .filter((record) => inScope(record, scope) && (include === 'all' || record.accomplished))
    .sort((a, b) => a.province.localeCompare(b.province) || a.municipality.localeCompare(b.municipality)
      || a.barangay.localeCompare(b.barangay) || a.name.localeCompare(b.name))
}
