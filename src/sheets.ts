import Papa from 'papaparse'

export const SPREADSHEET_ID = '1pOGqgiAp9mToEvC3tNrPubbeyUsJjyge7GDSD-wrZHQ'

export const WORKSHEETS = [
  { id: 'oriental', name: 'Davao Oriental', tab: 'DAVAO ORIENTAL' },
  { id: 'oro', name: 'Davao de Oro', tab: 'DAVAO DE ORO' },
  { id: 'norte', name: 'Davao del Norte', tab: 'DAVAO DEL NORTE' },
  { id: 'city', name: 'Davao City', tab: 'DAVAO CITY' },
  { id: 'sur', name: 'Davao del Sur', tab: 'DAVAO DEL SUR' },
  { id: 'occidental', name: 'Davao Occidental', tab: 'DAVAO OCCIDENTAL' },
] as const

const VALID_MODE = /\b(?:cash\s*card|e[\s-]*wallet)\b/i
export const REVIEW_PAGE_SIZE = 20

export type PaymentDetails = {
  servicingBranch: string
  dateRequested: string | null
  dateClaimed: string | null
  controlNo: string
  snapshot: string
  accountNumber2: string
  remarks: string
}

export type PersonalDetails = {
  sex: string
  birthday: string
  contact: string
  email: string
  pwd: string
  soloParent: string
  indigenous: string
  firstGen: string
}

export type EducationDetails = {
  member: string
  hei: string
  heiType: string
  degree: string
  yearLevel: string
  academicYear: string
}

export type ReviewRecord = {
  id: string
  province: string
  name: string
  municipality: string
  barangay: string
  householdId: string
  accountNumber: string
  paymentMode: string
  date: string | null
  accomplished: boolean
  payment: PaymentDetails
  personal: PersonalDetails
  education: EducationDetails
}

export function countAccomplishments(rows: string[][]) {
  return rows.filter((row) => row.some((cell) => VALID_MODE.test(String(cell).trim()))).length
}

export function paginateRecords<T>(records: T[], requestedPage: number, pageSize = REVIEW_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize))
  const page = Math.min(Math.max(1, requestedPage), totalPages)
  return records.slice((page - 1) * pageSize, page * pageSize)
}

export function filterRecordsByProvince<T extends { province: string }>(records: T[], province?: string) {
  return province ? records.filter((record) => record.province === province) : records
}

export function beneficiaryDetails(record: ReviewRecord): Array<[string, string]> {
  const value = (input: string | null) => input || '—'
  return [
    ['Entry ID', record.id],
    ['Province', record.province],
    ['Municipality', value(record.municipality)],
    ['Barangay', value(record.barangay)],
    ['Household ID', value(record.householdId)],
    ['Account number', value(record.accountNumber)],
    ['Status', record.accomplished ? 'Validated – For Review' : 'For Validation'],
  ]
}

export function paymentDetails(record: ReviewRecord): Array<[string, string]> {
  const value = (input: string | null) => input || '—'
  const { payment } = record
  return [
    ['Servicing branch', value(payment.servicingBranch)],
    ['Date requested', value(payment.dateRequested)],
    ['Mode of payment', value(record.paymentMode)],
    ['Date claimed / account opened', value(payment.dateClaimed)],
    ['Control no.', value(payment.controlNo)],
    ['Snapshot', value(payment.snapshot)],
    ['Account number 2', value(payment.accountNumber2)],
    ['MRB/PRB remarks', value(payment.remarks)],
  ]
}

export function personalDetails(record: ReviewRecord): Array<[string, string]> {
  const { personal } = record
  return [
    ['Sex', personal.sex || '—'],
    ['Birthday', personal.birthday || '—'],
    ['Contact number', personal.contact || '—'],
    ['Email', personal.email || '—'],
    ['PWD', personal.pwd || '—'],
    ['Solo parent dependent', personal.soloParent || '—'],
    ['Indigenous person', personal.indigenous || '—'],
    ['First-generation college student', personal.firstGen || '—'],
  ]
}

export function educationDetails(record: ReviewRecord): Array<[string, string]> {
  const { education } = record
  return [
    ['Household member', education.member || '—'],
    ['School (HEI)', education.hei || '—'],
    ['HEI type', education.heiType || '—'],
    ['Degree program', education.degree || '—'],
    ['Year level', education.yearLevel || '—'],
    ['Academic year', education.academicYear || '—'],
  ]
}

function normalizeDate(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const local = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (local) return `${local[3]}-${local[1].padStart(2, '0')}-${local[2].padStart(2, '0')}`
  return null
}

function cell(row: string[], index: number) {
  return index >= 0 ? String(row[index] ?? '').trim() : ''
}

export function extractReviewRecords(csv: string, province: string): ReviewRecord[] {
  const rows = Papa.parse<string[]>(csv, { skipEmptyLines: true }).data
  const headers = rows[0]?.map((value) => String(value).replace(/\s+/g, ' ').trim().toLowerCase()) ?? []
  const indexOf = (label: string) => headers.findIndex((header) => header === label)
  const entryIdIndex = indexOf('entry_id')
  const firstNameIndex = headers.findIndex((header) => header === 'grantee first_name')
  const lastNameIndex = headers.findIndex((header) => header === 'grantee last_name')
  const municipalityIndex = indexOf('municipality')
  const barangayIndex = indexOf('barangay')
  const householdIdIndex = indexOf('household id')
  const accountNumberIndex = headers.findIndex((header) => header === 'account number')
  const paymentIndex = headers.findIndex((header) => header.includes('mode of payment'))
  const claimedDateIndex = headers.findIndex((header) => header.includes('date claimed') || header.includes('account opened'))
  const requestedDateIndex = headers.findIndex((header) => header.includes('date requested'))
  const dateIndex = claimedDateIndex >= 0 ? claimedDateIndex : requestedDateIndex
  const servicingBranchIndex = indexOf('servicing branch')
  const controlNoIndex = indexOf('control no.')
  const snapshotIndex = indexOf('snapshot')
  const accountNumber2Index = indexOf('account number2')
  const remarksIndex = indexOf('mrb/prb remarks')
  const sexIndex = indexOf('sex')
  const birthdayIndex = indexOf('birthday')
  const contactIndex = indexOf('contact')
  const emailIndex = indexOf('email')
  const pwdIndex = indexOf('pwd')
  const soloParentIndex = indexOf('solo parent dependent')
  const indigenousIndex = indexOf('indigenous person')
  const firstGenIndex = indexOf('first generation college student')
  const memberFirstIndex = indexOf('member first name')
  const memberMiddleIndex = indexOf('member middle name')
  const memberLastIndex = indexOf('member last name')
  const heiIndex = indexOf('hei name')
  const heiTypeIndex = indexOf('hei type')
  const degreeIndex = indexOf('degree program')
  const yearLevelIndex = indexOf('year level')
  const academicYearIndex = indexOf('academic year')

  return rows.slice(1).flatMap((row) => {
    const id = cell(row, entryIdIndex)
    if (!id) return []
    const name = [cell(row, firstNameIndex), cell(row, lastNameIndex)].filter(Boolean).join(' ')
    const paymentMode = cell(row, paymentIndex)
    return [{
      id,
      province,
      name,
      municipality: cell(row, municipalityIndex),
      barangay: cell(row, barangayIndex),
      householdId: cell(row, householdIdIndex),
      accountNumber: cell(row, accountNumberIndex),
      paymentMode,
      date: normalizeDate(cell(row, dateIndex)),
      accomplished: paymentMode !== '',
      payment: {
        servicingBranch: cell(row, servicingBranchIndex),
        dateRequested: normalizeDate(cell(row, requestedDateIndex)),
        dateClaimed: normalizeDate(cell(row, claimedDateIndex)),
        controlNo: cell(row, controlNoIndex),
        snapshot: cell(row, snapshotIndex),
        accountNumber2: cell(row, accountNumber2Index),
        remarks: cell(row, remarksIndex),
      },
      personal: {
        sex: cell(row, sexIndex),
        birthday: cell(row, birthdayIndex),
        contact: cell(row, contactIndex),
        email: cell(row, emailIndex),
        pwd: cell(row, pwdIndex),
        soloParent: cell(row, soloParentIndex),
        indigenous: cell(row, indigenousIndex),
        firstGen: cell(row, firstGenIndex),
      },
      education: {
        member: [cell(row, memberFirstIndex), cell(row, memberMiddleIndex), cell(row, memberLastIndex)].filter(Boolean).join(' '),
        hei: cell(row, heiIndex),
        heiType: cell(row, heiTypeIndex),
        degree: cell(row, degreeIndex),
        yearLevel: cell(row, yearLevelIndex),
        academicYear: cell(row, academicYearIndex),
      },
    }]
  })
}

export function summarizeWorksheet(csv: string) {
  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: true })
  const rows = parsed.data
  const headers = rows[0]?.map((value) => String(value).replace(/\s+/g, ' ').trim().toLowerCase()) ?? []
  const entryIdIndex = headers.findIndex((header) => header === 'entry_id')
  const paymentIndex = headers.findIndex((header) => header.includes('mode of payment'))
  const claimedDateIndex = headers.findIndex((header) => header.includes('date claimed') || header.includes('account opened'))
  const requestedDateIndex = headers.findIndex((header) => header.includes('date requested'))
  const dateIndex = claimedDateIndex >= 0 ? claimedDateIndex : requestedDateIndex
  const daily: Record<string, number> = {}
  let target = 0
  let accomplished = 0

  for (const row of rows.slice(1)) {
    if (entryIdIndex < 0 || !String(row[entryIdIndex] ?? '').trim()) continue
    target += 1
    if (paymentIndex < 0 || !String(row[paymentIndex] ?? '').trim()) continue
    accomplished += 1
    const date = dateIndex >= 0 ? normalizeDate(String(row[dateIndex] ?? '')) : null
    if (date) daily[date] = (daily[date] ?? 0) + 1
  }

  return { target, accomplished, daily }
}

// The gviz CSV export drops rows hidden by a sheet filter, so a worker filtering their tab would shrink the counts.
// The Sheets API values endpoint returns every row regardless of filters; it needs an API key, so gviz stays the fallback.
async function readWorksheetCsv(tab: string, name: string, fetcher: typeof fetch, apiKey?: string) {
  const url = apiKey
    ? `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`'${tab}'`)}?valueRenderOption=FORMATTED_VALUE&key=${encodeURIComponent(apiKey)}`
    : `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`
  const response = await fetcher(url)
  if (!response.ok) throw new Error(`Unable to read ${name}`)
  if (!apiKey) return response.text()
  const { values = [] } = await response.json() as { values?: string[][] }
  return Papa.unparse(values)
}

export async function getAccomplishmentSnapshot(fetcher: typeof fetch = fetch, apiKey?: string) {
  const results = await Promise.all(WORKSHEETS.map(async (worksheet) => {
    const csv = await readWorksheetCsv(worksheet.tab, worksheet.name, fetcher, apiKey)
    const summary = summarizeWorksheet(csv)
    return { id: worksheet.id, name: worksheet.name, records: extractReviewRecords(csv, worksheet.name), ...summary }
  }))

  const dailyTotals: Record<string, number> = {}
  for (const province of results) {
    for (const [date, value] of Object.entries(province.daily)) {
      dailyTotals[date] = (dailyTotals[date] ?? 0) + value
    }
  }

  return {
    source: 'Google Sheets',
    provinces: results.map(({ daily, records: _records, ...province }) => ({
      ...province,
      today: daily[new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())] ?? 0,
    })),
    records: results.flatMap((province) => province.records),
    daily: Object.entries(dailyTotals).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
    lastRefresh: new Date().toISOString(),
  }
}
