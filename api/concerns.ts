import { getConcerns } from '../src/concerns.js'
import { approvedClient } from '../src/serverAuth.js'

type Payload = Awaited<ReturnType<typeof getConcerns>>
type ServerRequest = { url?: string; headers: Record<string, string | string[] | undefined> }
type ServerResponse = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void }
}

const CACHE_MS = 15_000
let cached: { at: number; payload: Payload } | undefined

export default async function handler(request: ServerRequest, response: ServerResponse) {
  response.setHeader('Cache-Control', 'private, no-store')
  try {
    if (!await approvedClient(request.headers.authorization)) {
      response.status(401).json({ error: 'Sign in with an approved account to view this data' })
      return
    }
    // ?fresh=1 (the Refresh button) skips the per-instance cache; polling reuses it for CACHE_MS.
    if (request.url?.includes('fresh=1') || !cached || Date.now() - cached.at > CACHE_MS) {
      cached = { at: Date.now(), payload: await getConcerns(fetch) }
    }
    response.status(200).json(cached.payload)
  } catch (error) {
    // Google hiccup: serve the last good copy rather than an error.
    if (cached) {
      response.status(200).json(cached.payload)
      return
    }
    response.status(502).json({ error: error instanceof Error ? error.message : 'Unable to read the concerns sheet' })
  }
}
