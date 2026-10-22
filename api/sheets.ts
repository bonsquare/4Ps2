import { getAccomplishmentSnapshot } from '../src/sheets.js'

type ServerResponse = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void }
}

export default async function handler(_request: unknown, response: ServerResponse) {
  try {
    const snapshot = await getAccomplishmentSnapshot()
    response.setHeader('Cache-Control', 'private, max-age=0, s-maxage=45, stale-while-revalidate=15')
    response.status(200).json(snapshot)
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : 'Unable to read Google Sheets' })
  }
}
