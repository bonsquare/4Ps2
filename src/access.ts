export type ApprovalStatus = 'pending' | 'approved' | 'denied'

export type UserProfile = {
  id: string
  email: string
  fullName: string
  position: string
  province: string
  status: ApprovalStatus
  isSuperAdmin: boolean
}

export function accessState(profile: UserProfile | null) {
  if (!profile) return 'profile'
  return profile.status
}

export function isSuperAdmin(profile: UserProfile | null) {
  return profile?.status === 'approved' && profile.isSuperAdmin
}
