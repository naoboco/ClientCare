import { useState, type FormEvent } from 'react'
import { isAuthError } from '@supabase/supabase-js'
import { signIn, loadProfile, type Profile } from './lib/auth'

type LoginProps = {
  onConnected: (profile: Profile) => void
}

export default function Login({ onConnected }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setErrorMessage('')

    try {
      const user = await signIn(email, password)
      const profile = await loadProfile(user.id)
      setPassword('')
      onConnected(profile)
    } catch (error) {
      if (isAuthError(error) && error.code === 'invalid_credentials') {
        setErrorMessage('Adresse email ou mot de passe incorrect.')
      } else if (isAuthError(error) && error.code === 'email_not_confirmed') {
        setErrorMessage('Confirmez votre adresse email avant de vous connecter.')
      } else {
        setErrorMessage('Connexion impossible pour le moment. Réessayez.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="olimline-login">
      <a href="#/olimline">← Retour à Olimline</a>
      <h1>Connexion Olimline</h1>
      <p>Retrouvez votre espace personnel.</p>

      <form onSubmit={handleSubmit} aria-busy={busy}>
        <label htmlFor="login-email">Adresse email</label>
        <input
          id="login-email" name="email" type="email"
          autoComplete="username" required disabled={busy}
          value={email} onChange={event => setEmail(event.target.value)}
        />

        <label htmlFor="login-password">Mot de passe</label>
        <input
          id="login-password" name="password" type="password"
          autoComplete="current-password" required disabled={busy}
          value={password} onChange={event => setPassword(event.target.value)}
        />

        {errorMessage && <p role="alert">{errorMessage}</p>}

        <button type="submit" className="button button-primary" disabled={busy}>
          {busy ? 'Connexion en cours…' : 'Se connecter'}
        </button>
      </form>
      <p>
        <a href="#/olimline/mot-de-passe">Mot de passe oublié ?</a>
      </p>
    </main>
  )
}