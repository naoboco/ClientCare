import { useEffect, useState, type FormEvent } from 'react'
import { db } from './lib/olimline'

type Props = { mode: 'request' | 'update' }
type Status = 'checking' | 'ready' | 'invalid'

export default function PasswordReset({ mode }: Props) {
  const updating = mode === 'update'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [status, setStatus] = useState<Status>(
    updating ? 'checking' : 'ready',
  )

  useEffect(() => {
    if (!updating) return
    let active = true

    async function checkLink() {
      try {
        const { data, error } = await db().auth.getUser()
        if (!active) return

        const url = new URL(window.location.href)
        url.searchParams.delete('olimline_auth')
        window.history.replaceState(null, '', url.href)

        setStatus(!error && data.user ? 'ready' : 'invalid')
      } catch {
        if (active) setStatus('invalid')
      }
    }

    void checkLink()
    return () => { active = false }
  }, [updating])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setErrorMessage('')

    if (updating && (status !== 'ready' || password !== confirmation)) {
      setErrorMessage(
        'Vérifiez le lien et saisissez deux mots de passe identiques.',
      )
      return
    }

    setBusy(true)

    try {
      if (updating) {
        const { error } = await db().auth.updateUser({ password })
        if (error) throw error

        setPassword('')
        setConfirmation('')
        setMessage('Votre nouveau mot de passe est enregistré.')
      } else {
        const url = new URL(
          import.meta.env.BASE_URL,
          window.location.origin,
        )
        url.searchParams.set('olimline_auth', 'recovery')

        const { error } = await db().auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: url.href },
        )
        if (error) throw error

        setMessage(
          'Si cette adresse correspond à un compte, un email de réinitialisation vous sera envoyé.',
        )
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Impossible de terminer cette opération.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="olimline-login">
      <h1>
        {updating ? 'Nouveau mot de passe' : 'Mot de passe oublié'}
      </h1>

      {status === 'checking' && (
        <p role="status">Vérification du lien…</p>
      )}

      {status === 'invalid' && (
        <p role="alert">
          Lien invalide ou expiré.{' '}
          <a href={import.meta.env.BASE_URL + '#/olimline/mot-de-passe'}>
            Demander un nouveau lien
          </a>
        </p>
      )}

      {message && <p role="status">{message}</p>}

      {status === 'ready' && !message && (
        <form onSubmit={handleSubmit} aria-busy={busy}>
          {updating ? (
            <>
              <label htmlFor="reset-password">
                Nouveau mot de passe — 12 caractères minimum
              </label>
              <input
                id="reset-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                disabled={busy}
                value={password}
                onChange={event => setPassword(event.target.value)}
              />

              <label htmlFor="reset-confirmation">
                Confirmer le mot de passe
              </label>
              <input
                id="reset-confirmation"
                name="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                disabled={busy}
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
              />
            </>
          ) : (
            <>
              <label htmlFor="reset-email">Adresse email du compte</label>
              <input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={busy}
                value={email}
                onChange={event => setEmail(event.target.value)}
              />
            </>
          )}

          <button type="submit" disabled={busy}>
            {busy
              ? 'Veuillez patienter…'
              : updating ? 'Enregistrer' : 'Envoyer le lien'}
          </button>
        </form>
      )}

      {errorMessage && <p role="alert">{errorMessage}</p>}

      <p>
        <a
          href={
            import.meta.env.BASE_URL +
            (updating && message
              ? '#/olimline/espace'
              : '#/olimline/connexion')
          }
        >
          {updating && message
            ? 'Ouvrir mon espace'
            : 'Retour à la connexion'}
        </a>
      </p>
    </main>
  )
}