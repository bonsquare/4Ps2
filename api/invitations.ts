/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'
import { normalizeEmail, validateInvitationInput, type InvitationInput } from '../src/invitations.js'

type ServerRequest = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
type ServerResponse = { setHeader(name: string, value: string): void; status(code: number): { json(body: unknown): void } }

const bodyOf = (body: unknown) => (body && typeof body === 'object' ? body as Partial<InvitationInput> : {})

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
    response.status(503).json({ error: 'Invitation service is not configured.' })
    return
  }
  const token = String(request.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token) {
    response.status(401).json({ error: 'Sign in as a Super Administrator to send invitations.' })
    return
  }

  try {
    const { data: { user }, error: userError } = await admin.auth.getUser(token)
    if (userError || !user) {
      response.status(401).json({ error: 'Your session is invalid or expired.' })
      return
    }
    const { data: caller } = await admin.from('user_profiles').select('status, is_super_admin').eq('id', user.id).maybeSingle()
    if (caller?.status !== 'approved' || !caller.is_super_admin) {
      response.status(403).json({ error: 'Only an approved Super Administrator can send invitations.' })
      return
    }

    const raw = bodyOf(request.body)
    const input: InvitationInput = {
      email: String(raw.email ?? ''),
      fullName: String(raw.fullName ?? ''),
      position: String(raw.position ?? ''),
      province: String(raw.province ?? ''),
    }
    const validation = validateInvitationInput(input)
    if (!validation.valid) {
      response.status(400).json({ error: validation.message })
      return
    }
    const email = normalizeEmail(input.email)
    const { data: existing } = await admin.from('user_invitations').select('id, expires_at').eq('email', email).eq('status', 'pending').maybeSingle()
    if (existing && Date.parse(existing.expires_at) > Date.now()) {
      response.status(409).json({ error: 'An active invitation already exists for this email.' })
      return
    }
    if (existing) await admin.from('user_invitations').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', existing.id)

    const siteUrl = process.env.SITE_URL || 'https://4-ps2.vercel.app'
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { invited_full_name: input.fullName.trim(), invited_position: input.position.trim(), invited_province: input.province.trim() },
      redirectTo: siteUrl,
    })
    if (inviteError) {
      response.status(502).json({ error: 'Supabase could not send the invitation email.' })
      return
    }
    const { data: invitation, error: insertError } = await admin.from('user_invitations').insert({
      email,
      full_name: input.fullName.trim(),
      position: input.position.trim(),
      province: input.province.trim(),
      invited_by: user.id,
    }).select('id, email, expires_at, status').single()
    if (insertError) {
      response.status(502).json({ error: 'The invitation was sent, but its tracking record could not be saved.' })
      return
    }
    response.status(200).json({ invitation })
  } catch {
    response.status(500).json({ error: 'Unable to send the invitation right now.' })
  }
}
