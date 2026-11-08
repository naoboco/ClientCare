import { useState } from 'react'
import Login from './Login.tsx'
import { db } from './lib/olimline'
import { inviteTokenPattern, staffLoginPaths } from './lib/staffAccess'

type Props = {
  token: string
  email: string | null
  onLogout: () => Promise<void>
  logoutBusy: boolean
  logoutError: string
}

export default function StaffInvitation({ token, email, onLogout, logoutBusy, logoutError }: Props) {
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function acceptInvitation() {
    if (busy || logoutBusy) return
    setBusy(true)
    setErrorMessage('')

    try {
      const { data, error } = await db().rpc('wo_accept_staff_invitation', { p_token: token })
      if (error) {
        setErrorMessage(error.code === '22023' || error.code === '42501'
          ? error.message
          : 'Impossible d’accepter cette invitation. Réessayez.')
        return
      }
      const role: unknown = data
      if (role !== 'admin' && role !== 'coordinator') throw new Error('Rôle inattendu')
      window.location.replace(staffLoginPaths[role])
    } catch {
      setErrorMessage('Impossible d’accepter cette invitation. Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  if (!inviteTokenPattern.test(token)) {
    return (
      <main className="olimline-account">
        <h1>Invitation Watchover</h1>
        <p role="alert">Ce lien est invalide. Demandez une nouvelle invitation à votre équipe.</p>
      </main>
    )
  }

  if (email === null) {
    return <Login title="Invitation Watchover" allowRegistration
      description="Utilisez l’adresse e-mail à laquelle l’invitation est destinée." />
  }

  return (
    <main className="olimline-account" aria-busy={busy}>
      <h1>Rejoindre votre équipe</h1>
      <p>Compte connecté <strong>{email}</strong></p>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {logoutError && <p role="alert">{logoutError}</p>}
      <div className="wo-staff-actions">
        <button type="button" disabled={busy || logoutBusy} onClick={() => void acceptInvitation()}>
          {busy ? 'Vérification…' : 'Accepter l’invitation'}
        </button>
        <button type="button" disabled={busy || logoutBusy} onClick={() => void onLogout()}>
          Changer de compte
        </button>
      </div>
    </main>
  )
}
