import type { SupabaseClient } from '@supabase/supabase-js'
import { accomplishedRecords, applyFirstSeen, entryKey, getAccomplishmentSnapshot } from '../src/sheets.js'
import { approvedClient } from '../src/serverAuth.js'

type Snapshot = Awaited<ReturnType<typeof getAccomplishmentSnapshot>>
type ServerRequest = { url?: string; headers: Record<string, string | string[] | undefined> }
type ServerResponse = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void }
}

const CACHE_MS = 15_000
let cached: { at: number; snapshot: Snapshot } | undefined

// Records the first day each accomplished row was seen (its validation date), and counts undated rows on that day.
// If the log table is missing or unreadable, those rows simply count as today.
async function withFirstSeen(snapshot: Snapshot, client: SupabaseClient) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
  const keys = accomplishedRecords(snapshot).map(entryKey)
  const firstSeen: Record<string, string> = {}
  if (keys.length) {
    const rows = keys.map((key) => ({ entry_key: key, province: key.split('|')[0] }))
    const { error } = await client.from('accomplishment_log').upsert(rows, { onConflict: 'entry_key', ignoreDuplicates: true })
    if (!error) {
      for (let from = 0; ; from += 1000) {
        const { data, error: readError } = await client.from('accomplishment_log').select('entry_key, first_seen').range(from, from + 999)
        if (readError) break
        for (const row of data ?? []) firstSeen[row.entry_key] = row.first_seen
        if (!data || data.length < 1000) break
      }
    }
  }
  return applyFirstSeen(snapshot, firstSeen, today)
}

export default async function handler(request: ServerRequest, response: ServerResponse) {
  response.setHeader('Cache-Control', 'private, no-store')
  try {
    const client = await approvedClient(request.headers.authorization)
    if (!client) {
      response.status(401).json({ error: 'Sign in with an approved account to view this data' })
      return
    }
    // Manual refresh (?fresh=1) skips the per-instance cache; background polling reuses it for CACHE_MS.
    const fresh = request.url?.includes('fresh=1')
    if (fresh || !cached || Date.now() - cached.at > CACHE_MS) {
      cached = { at: Date.now(), snapshot: await withFirstSeen(await getAccomplishmentSnapshot(fetch), client) }
    }
    response.status(200).json(cached.snapshot)
  } catch (error) {
    // Google hiccup: serve the last good snapshot rather than blanking the dashboard.
    if (cached) {
      response.status(200).json(cached.snapshot)
      return
    }
    response.status(502).json({ error: error instanceof Error ? error.message : 'Unable to read Google Sheets' })
  }
}
