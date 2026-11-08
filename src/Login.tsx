import { useState, type FormEvent } from 'react'
import { isAuthError } from '@supabase/supabase-js'
import { signIn } from './lib/auth'
import { db } from './lib/olimline'

type LoginProps = {
  onConnected?: () => void
  title?: string
  description?: string
  allowRegistration?: boolean
}

export default function Login({
  onConnected,
  title = 'Connexion Olimline',
  description = 'Retrouvez votre espace personnel.',
  allowRegistration = false,
}: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [registering, setRegistering] = useState(false)
  const [registrationSent, setRegistrationSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setErrorMessage('')

    try {
      if (allowRegistration && registering) {
        const { error } = await db().auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim(), watchover_access: 'staff_invite' },
          },
        })
        if (error) throw error
        setRegistrationSent(true)
        setRegistering(false)
      } else {
        await signIn(email, password)
        onConnected?.()
      }
      setPassword('')
    } catch (error) {
      if (isAuthError(error) && error.code === 'invalid_credentials') {
        setErrorMessage('Adresse email ou mot de passe incorrect.')
      } else if (isAuthError(error) && error.code === 'email_not_confirmed') {
        setErrorMessage('Confirmez votre adresse email avant de vous connecter.')
      } else if (isAuthError(error) && error.code === 'weak_password') {
        setErrorMessage('Choisissez un mot de passe plus robuste.')
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
      <h1>{registering ? 'Créer votre compte d’équipe' : title}</h1>
      <p>{description}</p>
      {registrationSent && (
        <p role="status">Vérifiez votre boîte e-mail pour confirmer votre adresse, puis revenez sur ce lien pour vous connecter.</p>
      )}

      <form onSubmit={handleSubmit} aria-busy={busy}>
        {registering && (
          <label>
            Nom complet
            <input autoComplete="name" required maxLength={160} disabled={busy}
              value={fullName} onChange={event => setFullName(event.target.value)} />
          </label>
        )}
        <label htmlFor="login-email">Adresse email</label>
        <input
          id="login-email" name="email" type="email"
          autoComplete="username" required disabled={busy}
          value={email} onChange={event => setEmail(event.target.value)}
        />

        <label htmlFor="login-password">Mot de passe</label>
        <input
          id="login-password" name="password" type="password"
          autoComplete={registering ? 'new-password' : 'current-password'}
          minLength={registering ? 8 : undefined} required disabled={busy}
          value={password} onChange={event => setPassword(event.target.value)}
        />

        {errorMessage && <p role="alert">{errorMessage}</p>}

        <button type="submit" className="button button-primary" disabled={busy}>
          {busy ? 'Veuillez patienter…' : registering ? 'Créer le compte' : 'Se connecter'}
        </button>
      </form>
      {allowRegistration && (
        <p>
          <button type="button" disabled={busy} onClick={() => {
            setRegistering(value => !value)
            setErrorMessage('')
            setPassword('')
          }}>
            {registering ? 'J’ai déjà un compte' : 'Créer un compte pour accepter l’invitation'}
          </button>
        </p>
      )}
      <p>
        <a href="#/olimline/mot-de-passe">Mot de passe oublié ?</a>
      </p>
    </main>
  )
}
