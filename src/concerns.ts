import Papa from 'papaparse'

// The community-concerns log lives in its own Google Sheet (a Q&A log kept by the field teams).
export const CONCERNS_SPREADSHEET_ID = '1U5NF8lOCQjPtk_oPTkvPOVBPvoEI79gvzJC4NY_wNd8'
export const CONCERNS_GID = '1361573843'
export const CONCERNS_SHEET_URL = `https://docs.google.com/spreadsheets/d/${CONCERNS_SPREADSHEET_ID}/edit?gid=${CONCERNS_GID}#gid=${CONCERNS_GID}`

export type ConcernStatus = 'Open' | 'Responded' | 'Resolved'
export const concernDrilldown = (status: ConcernStatus) => ({
  status,
  area: 'all' as const,
  province: 'all' as const,
  query: '',
  page: 1,
  targetId: 'concern-list',
})

export type Concern = {
  id: string
  area: string
  province: string
  concern: string
  response: string
  status: ConcernStatus
  answerUrl: string // opens the sheet on this concern's RESPONSE cell, ready to type the answer
}

const columnLetter = (index: number) => String.fromCharCode(65 + index)
const answerUrl = (row: number, responseIndex: number) => `${CONCERNS_SHEET_URL}&range=${columnLetter(responseIndex)}${row}`

function statusOf(response: string, remarks: string): ConcernStatus {
  const text = remarks.toLowerCase()
  if (text.includes('resolved')) return 'Resolved'
  if (response || text.includes('responded')) return 'Responded'
  return 'Open'
}

export function parseConcerns(csv: string): Concern[] {
  const rows = Papa.parse<string[]>(csv, { skipEmptyLines: false }).data
  const headers = (rows[0] ?? []).map((value) => String(value).replace(/\s+/g, ' ').trim().toLowerCase())
  const find = (label: string, fallback: number) => {
    const index = headers.findIndex((header) => header.includes(label))
    return index >= 0 ? index : fallback
  }
  const areaIndex = find('area', 0)
  const provinceIndex = find('province', 1)
  const concernIndex = find('question', 2)
  const responseIndex = find('response', 3)
  const remarksIndex = find('remarks', 4)

  let area = ''
  const concerns: Concern[] = []
  rows.slice(1).forEach((row, offset) => {
    const cell = (index: number) => String(row[index] ?? '').trim()
    // The area name is only written on the first row of its group, like a merged cell.
    if (cell(areaIndex)) area = cell(areaIndex)
    const concern = cell(concernIndex)
    if (!concern) return
    const response = cell(responseIndex)
    concerns.push({
      id: String(offset + 2),
      answerUrl: answerUrl(offset + 2, responseIndex),
      area: area || 'Uncategorized',
      province: cell(provinceIndex),
      concern,
      response,
      status: statusOf(response, cell(remarksIndex)),
    })
  })
  return concerns
}

export async function getConcerns(fetcher: typeof fetch = fetch) {
  const response = await fetcher(`https://docs.google.com/spreadsheets/d/${CONCERNS_SPREADSHEET_ID}/export?format=csv&gid=${CONCERNS_GID}`)
  if (!response.ok) throw new Error('Unable to read the ESSI Community Support sheet')
  return { concerns: parseConcerns(await response.text()), sheetUrl: CONCERNS_SHEET_URL, lastRefresh: new Date().toISOString() }
}
