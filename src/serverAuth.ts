import { createClient } from '@supabase/supabase-js'

// Shared by the serverless endpoints: only signed-in, approved users may read the sheet data.
// Returns a Supabase client acting as that user, or null when the request is not allowed.
export async function approvedClient(authorization: string | string[] | undefined) {
  const token = String(authorization ?? '').replace(/^Bearer\s+/i, '')
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!token || !url || !key) return null
  const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user } } = await client.auth.getUser(token)
  if (!user) return null
  const { data } = await client.from('user_profiles').select('status').eq('id', user.id).maybeSingle()
  return data?.status === 'approved' ? client : null
}
