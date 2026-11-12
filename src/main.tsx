import { lazy, StrictMode, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './Account.css'
import App from './App.tsx'
import Olimline from './Olimline.tsx'
import Login from './Login.tsx'
import Dashboard from './Dashboard.tsx'
import { supabase } from './lib/olimline'
import { loadProfile, signOut, type Profile, type Role } from './lib/auth'
import { clientPortalPath } from './lib/clientPortal'
import PasswordReset from './PasswordReset.tsx'
import StaffInvitation from './StaffInvitation.tsx'
import TeamAccess from './TeamAccess.tsx'
import { crmQuestionnairePath, staffInvitePath, staffLoginPaths, teamAccessPath } from './lib/staffAccess'

const CrmQuestionnaire = lazy(() => import('./CrmQuestionnaire.tsx'))
const ClientPortal = lazy(() => import('./ClientPortal.tsx'))

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
  requiredRole?: Role
  inviteToken: string | null
}) {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [result, setResult] = useState<AccountResult | null>(null)
  const [logoutError, setLogoutError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null
      const email = session?.user.email ?? null
      setIdentity(current => current?.userId === userId && current.email === email
        ? current : { userId, email })
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
      if (requiredRole === 'client' || result?.profile?.role === 'client') window.location.hash = clientPortalPath
      else if (requiredRole) window.location.hash = staffLoginPaths[requiredRole]
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
        key={requiredRole ?? 'olimline'}
        title={requiredRole === 'client' ? 'Espace client Olimline'
          : requiredRole === 'admin' ? 'Connexion administrateur'
          : requiredRole === 'coordinator' ? 'Connexion coordinateur' : undefined}
        description={requiredRole === 'client' ? 'Connectez-vous avec l’adresse e-mail de votre dossier.' : undefined}
        registration={requiredRole === 'client' ? 'client' : undefined}
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

  if (profile?.role === 'admin' && hash === crmQuestionnairePath) {
    return (
      <Suspense fallback={<p className="olimline-account" role="status">Ouverture du questionnaire…</p>}>
        <CrmQuestionnaire key={profile.organization_id} organizationId={profile.organization_id} />
      </Suspense>
    )
  }

  if (profile?.role === 'client') {
    return (
      <Suspense fallback={<p className="olimline-account" role="status">Ouverture de votre dossier…</p>}>
        <ClientPortal key={profile.id} onLogout={handleLogout} logoutBusy={busy} logoutError={logoutError} />
      </Suspense>
    )
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

export function Website() {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash)
  const isOlimline = hash === '#/olimline' || hash.startsWith('#/olimline/')
  const inviteToken = hash.startsWith(staffInvitePath) ? hash.slice(staffInvitePath.length) : null
  const requiredRole: Role | undefined = hash === clientPortalPath ? 'client'
    : hash === staffLoginPaths.coordinator ? 'coordinator'
      : hash === staffLoginPaths.admin || hash === teamAccessPath || hash === crmQuestionnairePath ? 'admin' : undefined
  const isAccount = hash === '#/olimline/connexion' || hash === '#/olimline/espace'
    || requiredRole !== undefined || inviteToken !== null
  const resetMode = hash === '#/olimline/mot-de-passe'
    ? 'request'
    : hash === '#/olimline/nouveau-mot-de-passe' ? 'update' : null
  const isAuthPage = isAccount || resetMode !== null

  useEffect(() => {
    const url = new URL(window.location.href)
    const flow = url.searchParams.get('olimline_auth')
    if (flow === 'recovery') {
      window.location.hash = '#/olimline/nouveau-mot-de-passe'
    } else if (flow === 'client') {
      url.searchParams.delete('olimline_auth')
      window.history.replaceState(null, '', url.href)
      window.location.hash = clientPortalPath
    }
  }, [])

  useEffect(() => {
    document.title = hash === clientPortalPath ? 'Espace client Olimline'
      : isAuthPage
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
