import { describe, expect, it, vi } from 'vitest'
import { createAuthController, type AuthClient } from './auth'

describe('Google authentication', () => {
  it('starts Google OAuth for Gmail and Google Workspace accounts', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null })
    const client = { auth: { signInWithOAuth } } as unknown as AuthClient
    const auth = createAuthController(client, () => 'https://monitor.example.gov.ph/')

    await auth.signInWithGoogle()

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://monitor.example.gov.ph/' },
    })
  })

  it('returns the current authenticated user', async () => {
    const user = { id: '123', email: 'staff@agency.gov.ph' }
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    } as unknown as AuthClient
    const auth = createAuthController(client)

    await expect(auth.getUser()).resolves.toEqual(user)
  })

  it('signs the current user out', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null })
    const client = { auth: { signOut } } as unknown as AuthClient
    const auth = createAuthController(client)

    await auth.signOut()

    expect(signOut).toHaveBeenCalledOnce()
  })

  it('surfaces provider errors instead of silently logging in', async () => {
    const client = {
      auth: { signInWithOAuth: vi.fn().mockResolvedValue({ error: new Error('Provider unavailable') }) },
    } as unknown as AuthClient
    const auth = createAuthController(client)

    await expect(auth.signInWithGoogle()).rejects.toThrow('Provider unavailable')
  })
})
