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

export function countAccomplishments(rows: string[][]) {
  return rows.filter((row) => row.some((cell) => VALID_MODE.test(String(cell).trim()))).length
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
    if (paymentIndex < 0 || !VALID_MODE.test(String(row[paymentIndex] ?? '').trim())) continue
    accomplished += 1
    const date = dateIndex >= 0 ? normalizeDate(String(row[dateIndex] ?? '')) : null
    if (date) daily[date] = (daily[date] ?? 0) + 1
  }

  return { target, accomplished, daily }
}

export async function getAccomplishmentSnapshot(fetcher: typeof fetch = fetch) {
  const results = await Promise.all(WORKSHEETS.map(async (worksheet) => {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(worksheet.tab)}`
    const response = await fetcher(url)
    if (!response.ok) throw new Error(`Unable to read ${worksheet.name}`)
    const summary = summarizeWorksheet(await response.text())
    return { id: worksheet.id, name: worksheet.name, ...summary }
  }))

  const dailyTotals: Record<string, number> = {}
  for (const province of results) {
    for (const [date, value] of Object.entries(province.daily)) {
      dailyTotals[date] = (dailyTotals[date] ?? 0) + value
    }
  }

  return {
    source: 'Google Sheets',
    provinces: results.map(({ daily, ...province }) => ({
      ...province,
      today: daily[new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())] ?? 0,
    })),
    daily: Object.entries(dailyTotals).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
    lastRefresh: new Date().toISOString(),
  }
}
