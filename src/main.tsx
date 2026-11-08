import { StrictMode, useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './Account.css'
import App from './App.tsx'
import Olimline from './Olimline.tsx'
import Login from './Login.tsx'
import Dashboard from './Dashboard.tsx'
import { supabase } from './lib/olimline'
import { loadProfile, signOut, type Profile } from './lib/auth'
import PasswordReset from './PasswordReset.tsx'
import StaffInvitation from './StaffInvitation.tsx'
import TeamAccess from './TeamAccess.tsx'
import { staffInvitePath, staffLoginPaths, teamAccessPath, type StaffRole } from './lib/staffAccess'

type Identity = { userId: string | null; email: string | null }
type AccountResult = {
  identity: Identity
  profile?: Profile
  error?: string
}

const roleNames = {
  client: 'Client',
  coordinator: 'Coordinateur',
  admin: 'Administratrice',
}

function Account({ hash, requiredRole, inviteToken }: {
  hash: string
  requiredRole?: StaffRole
  inviteToken: string | null
}) {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [result, setResult] = useState<AccountResult | null>(null)
  const [logoutError, setLogoutError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setIdentity({ userId: session?.user.id ?? null, email: session?.user.email ?? null })
      setLogoutError('')
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!identity?.userId || inviteToken !== null) return
    let active = true

    loadProfile(identity.userId).then(
      profile => {
        if (active) setResult({ identity, profile })
      },
      () => {
        if (active) {
          setResult({
            identity,
            error: 'Profil indisponible. Déconnectez-vous puis réessayez.',
          })
        }
      },
    )

    return () => { active = false }
  }, [identity, inviteToken])

  async function handleLogout() {
    if (busy) return
    setBusy(true)
    setLogoutError('')

    try {
      await signOut()
      if (requiredRole) window.location.hash = staffLoginPaths[requiredRole]
      else if (inviteToken === null) window.location.hash = '#/olimline/connexion'
    } catch {
      setLogoutError('La déconnexion a échoué. Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  if (!supabase) {
    return (
      <p className="olimline-account" role="alert">
        La configuration Supabase est manquante.
      </p>
    )
  }

  if (!identity) {
    return (
      <p className="olimline-account" role="status">
        Chargement de la session…
      </p>
    )
  }

  if (inviteToken !== null) {
    return <StaffInvitation token={inviteToken}
      email={identity.userId ? identity.email ?? '' : null}
      onLogout={handleLogout} logoutBusy={busy} logoutError={logoutError} />
  }

  if (!identity.userId) {
    return (
      <Login
        title={requiredRole === 'admin' ? 'Connexion administrateur'
          : requiredRole === 'coordinator' ? 'Connexion coordinateur' : undefined}
        onConnected={() => {
          if (!requiredRole) window.location.hash = '#/olimline/espace'
        }}
      />
    )
  }

  const current = result?.identity === identity ? result : null
  const profile = current?.profile

  if (profile && requiredRole && profile.role !== requiredRole) {
    return (
      <main className="olimline-account">
        <h1>Accès réservé</h1>
        <p role="alert">Connectez-vous avec un compte autorisé pour cet espace.</p>
        {logoutError && <p role="alert">{logoutError}</p>}
        <button type="button" onClick={handleLogout} disabled={busy}>
          {busy ? 'Déconnexion…' : 'Changer de compte'}
        </button>
      </main>
    )
  }

  if (profile?.role === 'admin' && hash === teamAccessPath) {
    return <TeamAccess key={profile.organization_id} organizationId={profile.organization_id} />
  }

  return profile ? (
    <Dashboard
      key={profile.id}
      profile={profile}
      roleLabel={roleNames[profile.role]}
      onLogout={handleLogout}
      logoutBusy={busy}
      logoutError={logoutError}
    />
  ) : (
    <main className="olimline-account">
      <a href="#/olimline">← Retour à Olimline</a>
      <h1>Mon espace Olimline</h1>
      {!current?.error && <p role="status">Chargement de votre profil…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {logoutError && <p role="alert">{logoutError}</p>}
      <button type="button" onClick={handleLogout} disabled={busy}>
        {busy ? 'Déconnexion…' : 'Se déconnecter'}
      </button>
    </main>
  )
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function Website() {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash)
  const isOlimline = hash === '#/olimline' || hash.startsWith('#/olimline/')
  const inviteToken = hash.startsWith(staffInvitePath) ? hash.slice(staffInvitePath.length) : null
  const requiredRole = hash === staffLoginPaths.coordinator ? 'coordinator'
    : hash === staffLoginPaths.admin || hash === teamAccessPath ? 'admin' : undefined
  const isAccount = hash === '#/olimline/connexion' || hash === '#/olimline/espace'
    || requiredRole !== undefined || inviteToken !== null
  const resetMode = hash === '#/olimline/mot-de-passe'
    ? 'request'
    : hash === '#/olimline/nouveau-mot-de-passe' ? 'update' : null
  const isAuthPage = isAccount || resetMode !== null

  useEffect(() => {
    const flow = new URLSearchParams(window.location.search).get('olimline_auth')
    if (flow === 'recovery') {
      window.location.hash = '#/olimline/nouveau-mot-de-passe'
    }
  }, [])

  useEffect(() => {
    document.title = isAuthPage
      ? 'Mon espace Olimline'
      : isOlimline
        ? 'Olimline — Les liens qui comptent'
        : 'Watchover — Your business. Your way.'

    document.documentElement.lang = isOlimline || isAuthPage ? 'fr' : 'en'

    if (isOlimline || isAuthPage) {
      const section = isAuthPage ? '' : hash.split('/')[2]
      const target = section ? document.getElementById('ol-' + section) : null

      if (target) target.scrollIntoView({ block: 'start' })
      else window.scrollTo(0, 0)
    } else if (hash === '#top' || hash === '') {
      window.scrollTo(0, 0)
    }
  }, [hash, isOlimline, isAuthPage])

  if (resetMode) return <PasswordReset key={resetMode} mode={resetMode} />
  if (isAccount) {
    return <Account key={inviteToken ?? 'account'} hash={hash} requiredRole={requiredRole} inviteToken={inviteToken} />
  }
  return isOlimline ? <Olimline /> : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Website />
  </StrictMode>,
)
