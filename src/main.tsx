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

type Identity = { userId: string | null }
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

function Account() {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [result, setResult] = useState<AccountResult | null>(null)
  const [logoutError, setLogoutError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setIdentity({ userId: session?.user.id ?? null })
      setLogoutError('')
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!identity?.userId) return
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
  }, [identity])

  async function handleLogout() {
    if (busy) return
    setBusy(true)
    setLogoutError('')

    try {
      await signOut()
      window.location.hash = '#/olimline/connexion'
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

  if (!identity.userId) {
    return (
      <Login
        onConnected={() => {
          window.location.hash = '#/olimline/espace'
        }}
      />
    )
  }

  const current = result?.identity === identity ? result : null
  const profile = current?.profile

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
  const isAccount = hash === '#/olimline/connexion' || hash === '#/olimline/espace'
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

    document.documentElement.lang = isOlimline ? 'fr' : 'en'

    if (isOlimline) {
      const section = isAuthPage ? '' : hash.split('/')[2]
      const target = section ? document.getElementById('ol-' + section) : null

      if (target) target.scrollIntoView({ block: 'start' })
      else window.scrollTo(0, 0)
    } else if (hash === '#top' || hash === '') {
      window.scrollTo(0, 0)
    }
  }, [hash, isOlimline, isAuthPage])

  if (resetMode) return <PasswordReset key={resetMode} mode={resetMode} />
  return isAccount ? <Account /> : isOlimline ? <Olimline /> : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Website />
  </StrictMode>,
)