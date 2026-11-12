import { db } from './olimline'

export type Role = 'client' | 'coordinator' | 'admin'

type ProfileIdentity = {
  id: string
  organization_id: string
  full_name: string
  email: string
}

export type StaffProfile = ProfileIdentity & { role: Exclude<Role, 'client'> }
export type Profile = StaffProfile | (ProfileIdentity & { role: 'client' })

export async function signIn(email: string, password: string) {
  const { data, error } = await db().auth.signInWithPassword({
    email: email.trim(),
    password,
  })

  if (error) throw error
  return data.user
}

export async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await db()
    .from('wo_profiles')
    .select('id, organization_id, role, full_name, email')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data as Profile
}

export async function signOut() {
  const { error } = await db().auth.signOut({ scope: 'local' })

  if (error) throw error
}
