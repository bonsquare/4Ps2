import { createClient, type User } from '@supabase/supabase-js'

export interface AuthClient {
  auth: {
    signInWithIdToken(options: {
      provider: 'google'
      token: string
      options: { captchaToken: string }
    }): Promise<{ error: Error | null }>
    signInWithOAuth(options: {
      provider: 'google'
      options: { redirectTo: string }
    }): Promise<{ error: Error | null }>
    getUser(): Promise<{ data: { user: User | null }; error: Error | null }>
    signOut(): Promise<{ error: Error | null }>
    onAuthStateChange?: (callback: (_event: string, session: { user: User } | null) => void) => {
      data: { subscription: { unsubscribe(): void } }
    }
  }
}

export function createAuthController(client: AuthClient, getRedirectUrl = () => globalThis.location?.origin ?? '') {
  return {
    async signInWithGoogle() {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getRedirectUrl() },
      })
      if (error) throw error
    },
    async signInWithGoogleIdToken(token: string, captchaToken: string) {
      const { error } = await client.auth.signInWithIdToken({
        provider: 'google',
        token,
        options: { captchaToken },
      })
      if (error) throw error
    },
    async getUser() {
      const { data, error } = await client.auth.getUser()
      if (error?.name === 'AuthSessionMissingError') return null
      if (error) throw error
      return data.user
    },
    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) throw error
    },
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

export const authConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const googleSignInConfigured = Boolean(googleClientId)
export const turnstileConfigured = Boolean(turnstileSiteKey)
export const authClient = authConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const auth = authClient ? createAuthController(authClient) : null
