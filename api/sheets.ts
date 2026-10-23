import { createClient } from '@supabase/supabase-js'
import { getAccomplishmentSnapshot } from '../src/sheets.js'

type ServerRequest = { url?: string; headers: Record<string, string | string[] | undefined> }
type ServerResponse = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void }
}

const CACHE_MS = 60_000
let cached: { at: number; snapshot: Awaited<ReturnType<typeof getAccomplishmentSnapshot>> } | undefined

// The snapshot carries beneficiary contact and personal details, so only signed-in, approved users may read it.
async function isApprovedUser(authorization: string | string[] | undefined) {
  const token = String(authorization ?? '').replace(/^Bearer\s+/i, '')
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!token || !url || !key) return false
  const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user } } = await client.auth.getUser(token)
  if (!user) return false
  const { data } = await client.from('user_profiles').select('status').eq('id', user.id).maybeSingle()
  return data?.status === 'approved'
}

export default async function handler(request: ServerRequest, response: ServerResponse) {
  response.setHeader('Cache-Control', 'private, no-store')
  try {
    if (!await isApprovedUser(request.headers.authorization)) {
      response.status(401).json({ error: 'Sign in with an approved account to view this data' })
      return
    }
    // Manual refresh (?fresh=1) skips the per-instance cache; background polling reuses it for CACHE_MS.
    const fresh = request.url?.includes('fresh=1')
    if (fresh || !cached || Date.now() - cached.at > CACHE_MS) {
      cached = { at: Date.now(), snapshot: await getAccomplishmentSnapshot(fetch, process.env.GOOGLE_API_KEY) }
    }
    response.status(200).json(cached.snapshot)
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : 'Unable to read Google Sheets' })
  }
}
