import Papa from 'papaparse'

export const SPREADSHEET_ID = '1pOGqgiAp9mToEvC3tNrPubbeyUsJjyge7GDSD-wrZHQ'

export const WORKSHEETS = [
  { id: 'oriental', name: 'Davao Oriental', tab: 'DAVAO ORIENTAL', gid: '1809151402' },
  { id: 'oro', name: 'Davao de Oro', tab: 'DAVAO DE ORO', gid: '1117267143' },
  { id: 'norte', name: 'Davao del Norte', tab: 'DAVAO DEL NORTE', gid: '553226537' },
  { id: 'city', name: 'Davao City', tab: 'DAVAO CITY', gid: '467420548' },
  { id: 'sur', name: 'Davao del Sur', tab: 'DAVAO DEL SUR', gid: '1692955273' },
  { id: 'occidental', name: 'Davao Occidental', tab: 'DAVAO OCCIDENTAL', gid: '1373907878' },
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
  countedDate?: string // the day an accomplished row is counted on (its sheet date, else first seen)
  validatedDate?: string // the day the validation (payment mode) was first detected by the system
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

const dash = (input: string | null) => input || '—'

export function personalInfo(record: ReviewRecord): Array<[string, string]> {
  const { personal, education } = record
  return [
    ['Entry ID', dash(record.id)],
    ['Household ID', dash(record.householdId)],
    ['Household member', dash(education.member)],
    ['Sex', dash(personal.sex)],
    ['Birthday', dash(personal.birthday)],
    ['PWD', dash(personal.pwd)],
    ['Solo parent dependent', dash(personal.soloParent)],
    ['Indigenous person', dash(personal.indigenous)],
    ['First-generation college student', dash(personal.firstGen)],
  ]
}

export function contactDetails(record: ReviewRecord): Array<[string, string]> {
  return [
    ['Province', dash(record.province)],
    ['Municipality', dash(record.municipality)],
    ['Barangay', dash(record.barangay)],
    ['Contact number', dash(record.personal.contact)],
    ['Email', dash(record.personal.email)],
  ]
}

export function schoolDetails(record: ReviewRecord): Array<[string, string]> {
  const { education } = record
  return [
    ['School (HEI)', dash(education.hei)],
    ['HEI type', dash(education.heiType)],
    ['Degree program', dash(education.degree)],
    ['Year level', dash(education.yearLevel)],
    ['Academic year', dash(education.academicYear)],
  ]
}

export function paymentDetails(record: ReviewRecord): Array<[string, string]> {
  const { payment } = record
  return [
    ['Mode of payment', dash(record.paymentMode)],
    ['Servicing branch', dash(payment.servicingBranch)],
    ['Date requested', dash(payment.dateRequested)],
    ['Date claimed / account opened', dash(payment.dateClaimed)],
    ['Date validated', dash(record.validatedDate ?? null)],
    ['Control no.', dash(payment.controlNo)],
    ['Account number', dash(record.accountNumber)],
    ['Account number 2', dash(payment.accountNumber2)],
    ['Snapshot', dash(payment.snapshot)],
  ]
}

export function remarksDetails(record: ReviewRecord): Array<[string, string]> {
  return [['MRB/PRB remarks', dash(record.payment.remarks)]]
}

export function statusLabel(record: ReviewRecord) {
  return record.accomplished ? 'Validated' : 'For Validation'
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

// Reads the tab through the CSV export by gid. Unlike the gviz endpoint, it returns every row even when a
// worker has filtered the sheet, so filtering can never change the counts. Needs no API key.
async function readWorksheetCsv(gid: string, name: string, fetcher: typeof fetch) {
  const response = await fetcher(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`)
  if (!response.ok) throw new Error(`Unable to read ${name}`)
  return response.text()
}

export async function getAccomplishmentSnapshot(fetcher: typeof fetch = fetch) {
  const results = await Promise.all(WORKSHEETS.map(async (worksheet) => {
    const csv = await readWorksheetCsv(worksheet.gid, worksheet.name, fetcher)
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
    provinces: results.map(({ records: _records, ...province }) => ({
      ...province,
      today: province.daily[new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())] ?? 0,
    })),
    records: results.flatMap((province) => province.records),
    daily: Object.entries(dailyTotals).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
    lastRefresh: new Date().toISOString(),
  }
}

type Snapshot = Awaited<ReturnType<typeof getAccomplishmentSnapshot>>

export const entryKey = (record: { province: string; id: string }) => `${record.province}|${record.id}`
export const undatedAccomplished = (snapshot: Snapshot) => snapshot.records.filter((record) => record.accomplished && !record.date)
export const accomplishedRecords = (snapshot: Snapshot) => snapshot.records.filter((record) => record.accomplished)

// Accomplished rows with no date in the sheet are counted on the day they were first seen (firstSeen),
// or on `today` when that is not recorded yet, so the daily graph always adds up to the accomplished total.
export function applyFirstSeen(snapshot: Snapshot, firstSeen: Record<string, string>, today: string): Snapshot {
  const daily: Record<string, number> = Object.fromEntries(snapshot.daily.map((item) => [item.date, item.value]))
  const provinces = snapshot.provinces.map((province) => ({ ...province, daily: { ...province.daily } }))
  for (const record of undatedAccomplished(snapshot)) {
    const province = provinces.find((item) => item.name === record.province)
    if (!province) continue
    const date = firstSeen[entryKey(record)] ?? today
    province.daily[date] = (province.daily[date] ?? 0) + 1
    daily[date] = (daily[date] ?? 0) + 1
    if (date === today) province.today += 1
  }
  const records = snapshot.records.map((record) => {
    if (!record.accomplished) return record
    // Date Claimed/Account Opened is the validation date; first-seen only fills in rows without one.
    const validatedDate = record.date ?? firstSeen[entryKey(record)] ?? today
    return { ...record, validatedDate, countedDate: validatedDate }
  })
  return {
    ...snapshot,
    records,
    provinces,
    daily: Object.entries(daily).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
  }
}

// Target, accomplished and per-day counts for any slice of records (e.g. one municipality).
export function summarizeRecords(records: ReviewRecord[], today: string) {
  const daily: Record<string, number> = {}
  let accomplished = 0
  for (const record of records) {
    if (!record.accomplished) continue
    accomplished += 1
    if (record.countedDate) daily[record.countedDate] = (daily[record.countedDate] ?? 0) + 1
  }
  return { target: records.length, accomplished, today: daily[today] ?? 0, daily }
}
