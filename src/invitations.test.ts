import { describe, expect, it } from 'vitest'
import { isInvitationExpired, normalizeEmail, sortInvitationsByExpiry, validateInvitationInput } from './invitations'

describe('invitation helpers', () => {
  it('normalizes invitation email addresses', () => {
    expect(normalizeEmail('  Person@Example.COM ')).toBe('person@example.com')
  })

  it('validates the invitation email and profile fields', () => {
    expect(validateInvitationInput({ email: 'person@example.com', fullName: 'Maria Santos', position: 'Encoder', province: 'Davao del Sur' })).toEqual({ valid: true })
    expect(validateInvitationInput({ email: 'wrong', fullName: '', position: ' ', province: '' }).valid).toBe(false)
  })

  it('detects expired invitation timestamps', () => {
    expect(isInvitationExpired('2026-10-25T00:00:00.000Z', new Date('2026-10-26T00:00:00.000Z'))).toBe(true)
    expect(isInvitationExpired('2026-10-27T00:00:00.000Z', new Date('2026-10-26T00:00:00.000Z'))).toBe(false)
  })
  it('keeps pending invitations ordered by soonest expiration', () => {
    const invitations = [
      { id: 'later', expiresAt: '2026-10-30T00:00:00.000Z' },
      { id: 'soon', expiresAt: '2026-10-27T00:00:00.000Z' },
    ]
    expect(sortInvitationsByExpiry(invitations).map((item) => item.id)).toEqual(['soon', 'later'])
  })
})
