import { describe, expect, it } from 'vitest'
import { accessState, isSuperAdmin, type UserProfile } from './access'

const approvedProfile: UserProfile = {
  id: 'person-1', email: 'member@example.com', fullName: 'Maria Santos', position: 'Provincial Link', province: 'Davao del Sur', status: 'approved', isSuperAdmin: false,
}

describe('accessState', () => {
  it('keeps a first-time Google account on the profile form instead of the dashboard', () => {
    expect(accessState(null)).toBe('profile')
  })

  it('blocks a pending account from the dashboard', () => {
    expect(accessState({ ...approvedProfile, status: 'pending' })).toBe('pending')
  })

  it('admits an approved account to the dashboard', () => {
    expect(accessState(approvedProfile)).toBe('approved')
  })
})

describe('isSuperAdmin', () => {
  it('exposes approval controls only to the approved super administrator', () => {
    expect(isSuperAdmin({ ...approvedProfile, isSuperAdmin: true })).toBe(true)
    expect(isSuperAdmin(approvedProfile)).toBe(false)
    expect(isSuperAdmin({ ...approvedProfile, status: 'pending', isSuperAdmin: true })).toBe(false)
  })
})
