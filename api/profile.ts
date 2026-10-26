/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import { normalizeEmail, validateInvitationInput, type InvitationInput } from '../src/invitations.js'

type ServerRequest = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
type ServerResponse = { setHeader(name: string, value: string): void; status(code: number): { json(body: unknown): void } }

function bodyOf(body: unknown) {
  return body && typeof body === 'object' ? body as Partial<InvitationInput> : {}
}

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && serviceKey ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) : null
}

export default async function handler(request: ServerRequest, response: ServerResponse) {
  response.setHeader('Cache-Control', 'private, no-store')
  if (request.method && request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed.' })
    return
  }
  const admin = adminClient()
  if (!admin) {
    response.status(503).json({ error: 'Profile service is not configured.' })
    return
  }
  const token = String(request.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token) {
    response.status(401).json({ error: 'Your session is invalid or expired.' })
    return
  }
  try {
    const { data: { user }, error: userError } = await admin.auth.getUser(token)
    if (userError || !user?.email) {
      response.status(401).json({ error: 'Your session is invalid or expired.' })
      return
    }
    const raw = bodyOf(request.body)
    const input: InvitationInput = {
      email: user.email,
      fullName: String(raw.fullName ?? ''),
      position: String(raw.position ?? ''),
      province: String(raw.province ?? ''),
    }
    const validation = validateInvitationInput(input)
    if (!validation.valid) {
      response.status(400).json({ error: validation.message })
      return
    }
    const { data: existing } = await admin.from('user_profiles').select('id').eq('id', user.id).maybeSingle()
    if (existing) {
      response.status(409).json({ error: 'A profile already exists for this Google account.' })
      return
    }
    const email = normalizeEmail(user.email)
    const { data: invitation } = await admin.from('user_invitations').select('id, expires_at, status').eq('email', email).eq('status', 'pending').maybeSingle()
    if (invitation && Date.parse(invitation.expires_at) <= Date.now()) {
      await admin.from('user_invitations').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', invitation.id)
      response.status(410).json({ error: 'This invitation has expired. Ask the Super Administrator to resend it.' })
      return
    }
    const { data: profile, error: insertError } = await admin.from('user_profiles').insert({
      id: user.id,
      email,
      full_name: input.fullName.trim(),
      position: input.position.trim(),
      province: input.province.trim(),
      status: 'pending',
      is_super_admin: false,
    }).select('id, email, full_name, position, province, status, is_super_admin').single()
    if (insertError) {
      response.status(502).json({ error: 'Unable to save your profile right now.' })
      return
    }
    if (invitation) {
      await admin.from('user_invitations').update({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_user_id: user.id, updated_at: new Date().toISOString() }).eq('id', invitation.id)
    }
    response.status(200).json({ profile })
  } catch {
    response.status(500).json({ error: 'Unable to save your profile right now.' })
  }
}
