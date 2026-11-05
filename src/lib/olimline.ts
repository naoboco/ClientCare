import { createClient } from '@supabase/supabase-js'

const projectUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabase = projectUrl && publicKey
  ? createClient(projectUrl, publicKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    })
  : null

export function db() {
  if (!supabase) {
    throw new Error('La configuration Supabase est manquante.')
  }

  return supabase
}