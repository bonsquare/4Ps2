import { describe, expect, it } from 'vitest'
import { beneficiaryList, buildEnrollmentInsights, buildEnrollmentReport, buildPaymentInsights, buildReport, enrollmentStatusLabel } from './reports'
import type { ReviewRecord } from './sheets'

const blank = {
  householdId: '', accountNumber: '', date: null,
  payment: { servicingBranch: '', dateRequested: null, dateClaimed: null, controlNo: '', snapshot: '', accountNumber2: '', remarks: '' },
  personal: { sex: '', birthday: '', contact: '', email: '', pwd: '', soloParent: '', indigenous: '', firstGen: '' },
  education: { member: '', hei: '', heiType: '', degree: '', yearLevel: '', academicYear: '' },
}
const record = (id: string, province: string, municipality: string, barangay: string, paymentMode: string, name = id): ReviewRecord =>
  ({ ...blank, id, name, province, municipality, barangay, paymentMode, accomplished: paymentMode !== '' })

const records = [
  record('1', 'Davao del Sur', 'HAGONOY', 'LELING', 'GCash'),
  record('2', 'Davao del Sur', 'HAGONOY', 'LELING', 'Gcash '),
  record('3', 'Davao del Sur', 'HAGONOY', 'SACUB', ''),
  record('4', 'Davao del Sur', 'PADADA', 'PALILI', 'VISA'),
  record('5', 'Davao Oriental', 'MATI', 'CENTRAL', 'Paymaya'),
  record('6', 'Davao Oriental', 'MATI', 'CENTRAL', ''),
]

describe('buildReport', () => {
  it('regional report lists provinces with target, actual, remaining and percent', () => {
    const report = buildReport(records, {})

    expect(report.level).toBe('Regional')
    expect(report.childLabel).toBe('Province')
    expect(report.rows.map((row) => [row.name, row.target, row.actual, row.remaining, row.percent])).toEqual([
      ['Davao del Sur', 4, 3, 1, 75],
      ['Davao Oriental', 2, 1, 1, 50],
    ])
    expect(report.total).toMatchObject({ target: 6, actual: 4, remaining: 2, percent: 66.7 })
  })

  it('provincial report lists municipalities, municipal report lists barangays', () => {
    const provincial = buildReport(records, { province: 'Davao del Sur' })
    expect(provincial.level).toBe('Provincial')
    expect(provincial.rows.map((row) => [row.name, row.target, row.actual])).toEqual([['HAGONOY', 3, 2], ['PADADA', 1, 1]])

    const municipal = buildReport(records, { province: 'Davao del Sur', municipality: 'HAGONOY' })
    expect(municipal.level).toBe('Municipal')
    expect(municipal.childLabel).toBe('Barangay')
    expect(municipal.rows.map((row) => [row.name, row.target, row.actual])).toEqual([['LELING', 2, 2], ['SACUB', 1, 0]])
  })

  it('breaks validated beneficiaries down by payment mode, ignoring case and spacing, most used first', () => {
    const report = buildReport(records, {})

    expect(report.modes).toEqual(['GCash', 'Paymaya', 'VISA'])
    expect(report.total.modes).toEqual({ GCash: 2, VISA: 1, Paymaya: 1 })
    expect(report.rows[0].modes).toEqual({ GCash: 2, VISA: 1 })
    expect(report.modeShare[0]).toEqual({ mode: 'GCash', count: 2, percent: 50 })
  })
})

describe('buildEnrollmentReport', () => {
  const enrollmentRecords = [
    { ...record('e1', 'Davao del Sur', 'HAGONOY', 'LELING', 'Cash Card'), enrollmentStatus: 'Enrolled' },
    { ...record('e2', 'Davao del Sur', 'HAGONOY', 'SACUB', 'GCash'), enrollmentStatus: 'not enrolled' },
    { ...record('e3', 'Davao del Sur', 'PADADA', 'PALILI', 'Visa'), enrollmentStatus: '' },
    { ...record('e4', 'Davao Oriental', 'MATI', 'CENTRAL', 'Cash Card'), enrollmentStatus: ' Enrolled ' },
    { ...record('e5', 'Davao Oriental', 'MATI', 'CENTRAL', 'PayMaya'), enrollmentStatus: 'Pending' },
    { ...record('e6', 'Davao City', 'BUNAWAN', 'ILANG', ''), enrollmentStatus: '' },
  ]

  it('bases province enrollment counts and rates on validated beneficiaries', () => {
    expect(buildEnrollmentReport(enrollmentRecords, {})).toEqual({
      childLabel: 'Province',
      rows: [
        { name: 'Davao City', validated: 0, enrolled: 0, notEnrolled: 0, untagged: 0, enrolledPercent: 0, notEnrolledPercent: 0, untaggedPercent: 0 },
        { name: 'Davao del Sur', validated: 3, enrolled: 1, notEnrolled: 1, untagged: 1, enrolledPercent: 33.3, notEnrolledPercent: 33.3, untaggedPercent: 33.3 },
        { name: 'Davao Oriental', validated: 2, enrolled: 1, notEnrolled: 0, untagged: 1, enrolledPercent: 50, notEnrolledPercent: 0, untaggedPercent: 50 },
      ],
      total: { name: 'TOTAL', validated: 5, enrolled: 2, notEnrolled: 1, untagged: 2, enrolledPercent: 40, notEnrolledPercent: 20, untaggedPercent: 40 },
    })
  })

  it('groups the selected province by municipality for the provincial view', () => {
    expect(buildEnrollmentReport(enrollmentRecords, { province: 'Davao del Sur' }).rows).toEqual([
      { name: 'HAGONOY', validated: 2, enrolled: 1, notEnrolled: 1, untagged: 0, enrolledPercent: 50, notEnrolledPercent: 50, untaggedPercent: 0 },
      { name: 'PADADA', validated: 1, enrolled: 0, notEnrolled: 0, untagged: 1, enrolledPercent: 0, notEnrolledPercent: 0, untaggedPercent: 100 },
    ])
  })

  it('builds a live summary from all validated enrollment records', () => {
    expect(buildEnrollmentInsights(buildEnrollmentReport(enrollmentRecords, {}))).toEqual({
      validated: 5,
      enrolled: 2,
      notEnrolled: 1,
      untagged: 2,
      highest: { name: 'Davao del Sur', count: 1 },
      enrollmentPercent: 40,
      progressLabel: '2 enrolled · 1 not enrolled · 2 not yet tagged of 5 validated beneficiaries',
    })
  })

  it('returns a safe live summary before any enrollment status is tagged', () => {
    expect(buildEnrollmentInsights(buildEnrollmentReport([], {}))).toEqual({
      validated: 0,
      enrolled: 0,
      notEnrolled: 0,
      untagged: 0,
      highest: { name: 'No enrollment yet', count: 0 },
      enrollmentPercent: 0,
      progressLabel: '0 enrolled · 0 not enrolled · 0 not yet tagged of 0 validated beneficiaries',
    })
  })

  it('counts only validated beneficiaries inside the enrollment report date coverage', () => {
    const datedRecords = [
      { ...enrollmentRecords[0], validatedDate: '2026-10-28' },
      { ...enrollmentRecords[1], validatedDate: '2026-10-27' },
      { ...enrollmentRecords[2], validatedDate: '2026-10-28' },
    ]

    expect(buildEnrollmentReport(datedRecords, {}, { from: '2026-10-28', to: '2026-10-28' }).total).toEqual({
      name: 'TOTAL', validated: 2, enrolled: 1, notEnrolled: 0, untagged: 1,
      enrolledPercent: 50, notEnrolledPercent: 0, untaggedPercent: 50,
    })
  })

  it('labels printable beneficiary enrollment statuses consistently', () => {
    expect(enrollmentStatusLabel(enrollmentRecords[0])).toBe('Enrolled')
    expect(enrollmentStatusLabel(enrollmentRecords[1])).toBe('Not Enrolled')
    expect(enrollmentStatusLabel(enrollmentRecords[2])).toBe('Not Yet Tagged')
    expect(enrollmentStatusLabel(enrollmentRecords[5])).toBe('Not validated')
  })
})

describe('buildPaymentInsights', () => {
  it('summarizes the leading mode, highest accomplishment and largest validation backlog', () => {
    const insights = buildPaymentInsights(buildReport(records, {}))

    expect(insights).toEqual({
      leadingMode: { name: 'GCash', count: 2, percent: 50 },
      highestAccomplishment: { name: 'Davao del Sur', count: 3 },
      largestBacklog: { name: 'Davao del Sur', count: 1 },
      validatedPercent: 66.7,
      progressLabel: '4 of 6 beneficiaries validated',
    })
  })

  it('returns safe empty values when there are no report records', () => {
    expect(buildPaymentInsights(buildReport([], {}))).toEqual({
      leadingMode: { name: 'No validated mode yet', count: 0, percent: 0 },
      highestAccomplishment: { name: 'No accomplishment yet', count: 0 },
      largestBacklog: { name: 'No backlog', count: 0 },
      validatedPercent: 0,
      progressLabel: '0 of 0 beneficiaries validated',
    })
  })

  it('lists beneficiaries by latest validated date across provinces', () => {
    const dated = records.map((item, index) => ({ ...item, validatedDate: index === 0 ? '2026-10-23' : index === 1 ? '2026-10-26' : '2026-10-24' }))
    expect(beneficiaryList(dated, {}, 'validated').map((item) => item.id)).toEqual(['2', '4', '5', '1'])
  })
})

describe('date coverage', () => {
  const dated = records.map((item, index) => ({ ...item, validatedDate: item.accomplished ? (index < 2 ? '2026-10-20' : '2026-10-23') : undefined }))

  it('counts as Actual only beneficiaries validated inside the coverage, and keeps the target whole', () => {
    const report = buildReport(dated, {}, { from: '2026-10-23', to: '2026-10-23' })

    expect(report.total).toMatchObject({ target: 6, actual: 2, remaining: 4 })
    expect(report.total.modes).toEqual({ VISA: 1, Paymaya: 1 })
  })

  it('treats a blank coverage as all dates, and an open-ended range as from/up to', () => {
    expect(buildReport(dated, {}).total.actual).toBe(4)
    expect(buildReport(dated, {}, { from: '2026-10-21' }).total.actual).toBe(2)
    expect(buildReport(dated, {}, { to: '2026-10-21' }).total.actual).toBe(2)
  })

  it('limits the validated name list to the coverage', () => {
    expect(beneficiaryList(dated, {}, 'validated', { from: '2026-10-23' }).map((item) => item.id)).toEqual(['4', '5'])
    expect(beneficiaryList(dated, {}, 'all', { from: '2026-10-23' })).toHaveLength(6)
  })
})

describe('beneficiaryList', () => {
  it('lists validated beneficiaries (or everyone) in the scope, sorted by place then name', () => {
    expect(beneficiaryList(records, { province: 'Davao del Sur' }, 'validated').map((item) => item.id)).toEqual(['1', '2', '4'])
    expect(beneficiaryList(records, { province: 'Davao del Sur' }, 'all')).toHaveLength(4)
    expect(beneficiaryList(records, {}, 'all')).toHaveLength(6)
  })
})
