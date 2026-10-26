export type InvitationInput = {
  email: string
  fullName: string
  position: string
  province: string
}

export type InvitationValidation = { valid: true } | { valid: false; message: string }

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function validateInvitationInput(input: InvitationInput): InvitationValidation {
  const email = normalizeEmail(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { valid: false, message: 'Enter a valid email address.' }
  if (!input.fullName.trim()) return { valid: false, message: 'Enter the user’s full name.' }
  if (!input.position.trim()) return { valid: false, message: 'Enter the user’s position.' }
  if (!input.province.trim()) return { valid: false, message: 'Select the user’s province or office.' }
  return { valid: true }
}

export function isInvitationExpired(expiresAt: string, now = new Date()) {
  const timestamp = Date.parse(expiresAt)
  return !Number.isFinite(timestamp) || timestamp <= now.getTime()
}
