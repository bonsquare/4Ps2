import { createClient, type User } from '@supabase/supabase-js'

export interface AuthClient {
  auth: {
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

export const authConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const authClient = authConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const auth = authClient ? createAuthController(authClient) : null
