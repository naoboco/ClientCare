import { useEffect, useState, type FormEvent } from 'react'
import { db } from './lib/olimline'
import { inviteTokenPattern, staffInvitePath, staffLoginPaths, type StaffRole } from './lib/staffAccess'

type Invitation = {
  id: string
  email: string
  role: StaffRole
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

const roles: Record<StaffRole, string> = {
  admin: 'Administrateur',
  coordinator: 'Coordinateur',
}

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

function invitationStatus(invitation: Invitation, checkedAt: number) {
  if (invitation.accepted_at) return 'Acceptée'
  if (invitation.revoked_at) return 'Annulée'
  return Date.parse(invitation.expires_at) <= checkedAt ? 'Expirée' : 'En attente'
}

export default function TeamAccess({ organizationId }: { organizationId: string }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffRole>('coordinator')
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [checkedAt, setCheckedAt] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [created, setCreated] = useState<{ url: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const request = new AbortController()

    async function load() {
      try {
        const { data, error } = await db().from('wo_staff_invitations')
          .select('id, email, role, expires_at, accepted_at, revoked_at')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(50)
          .abortSignal(request.signal)
        if (request.signal.aborted) return
        if (error) throw error
        setInvitations(data as Invitation[])
        setCheckedAt(Date.now())
        setLoadError(false)
      } catch {
        if (!request.signal.aborted) setLoadError(true)
      } finally {
        if (!request.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => request.abort()
  }, [organizationId, revision])

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setErrorMessage('')
    setCreated(null)
    setCopied(false)

    try {
      const { data, error } = await db().rpc('wo_create_staff_invitation', {
        p_email: email, p_role: role,
      })
      if (error || typeof data?.token !== 'string' || !inviteTokenPattern.test(data.token)
        || typeof data.expires_at !== 'string') throw new Error('Invitation indisponible')

      setCreated({ url: new URL(staffInvitePath + data.token, window.location.origin).href, expiresAt: data.expires_at })
      setEmail('')
      setRevision(value => value + 1)
    } catch {
      setErrorMessage('Impossible de créer l’invitation. Vérifiez l’adresse e-mail puis réessayez.')
    } finally {
      setBusy(false)
    }
  }

  async function cancelInvitation(id: string) {
    if (busy) return
    setBusy(true)
    setErrorMessage('')

    try {
      const { data, error } = await db().from('wo_staff_invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('organization_id', organizationId).eq('id', id)
        .select('id').maybeSingle()
      if (error || !data) throw new Error('Invitation indisponible')
      if (created?.url.includes(id)) setCreated(null)
    } catch {
      setErrorMessage('Impossible d’annuler cette invitation. Vérifiez son statut.')
    } finally {
      setRevision(value => value + 1)
      setBusy(false)
    }
  }

  async function copyInvitation() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.url)
      setCopied(true)
    } catch {
      setErrorMessage('Sélectionnez le lien pour le copier manuellement.')
    }
  }

  return (
    <main className="olimline-account wo-team-access" data-role="admin">
      <a href={staffLoginPaths.admin}>← Retour à l’espace administrateur</a>
      <h1>Accès de l’équipe</h1>
      <p>Chaque invitation est réservée à une adresse e-mail, expire après 24 heures et permet une seule activation.</p>

      <section aria-labelledby="wo-team-invite-title">
        <h2 id="wo-team-invite-title">Créer une invitation</h2>
        <form className="wo-staff-form" onSubmit={createInvitation} aria-busy={busy}>
          <label>
            E-mail du destinataire
            <input type="email" required maxLength={254} value={email} disabled={busy}
              onChange={event => setEmail(event.target.value)} />
          </label>
          <label>
            Rôle
            <select value={role} disabled={busy} onChange={event => setRole(event.target.value as StaffRole)}>
              <option value="coordinator">Coordinateur</option>
              <option value="admin">Administrateur</option>
            </select>
          </label>
          <button type="submit" disabled={busy}>Créer le lien privé</button>
        </form>

        {errorMessage && <p role="alert">{errorMessage}</p>}
        {created && (
          <div className="wo-staff-created">
            <p>Partagez ce lien uniquement avec le destinataire. Il expire le {dateTime.format(new Date(created.expiresAt))}.</p>
            <label>
              Lien d’invitation
              <input readOnly value={created.url} onFocus={event => event.target.select()} />
            </label>
            <button type="button" onClick={() => void copyInvitation()}>Copier le lien</button>
            {copied && <span role="status"> Lien copié.</span>}
          </div>
        )}
      </section>

      <section aria-labelledby="wo-team-history-title">
        <h2 id="wo-team-history-title">Invitations récentes</h2>
        {loading && <p role="status">Chargement des invitations…</p>}
        {loadError && (
          <div>
            <p role="alert">Impossible de charger les invitations.</p>
            <button type="button" onClick={() => setRevision(value => value + 1)}>Réessayer</button>
          </div>
        )}
        {!loading && !loadError && invitations.length === 0 && <p>Aucune invitation pour le moment.</p>}
        <ul className="wo-staff-invitations">
          {invitations.map(invitation => {
            const status = invitationStatus(invitation, checkedAt)
            return (
              <li key={invitation.id}>
                <span><strong>{invitation.email}</strong><br />{roles[invitation.role]} · {status}</span>
                {status === 'En attente' && (
                  <button type="button" disabled={busy} onClick={() => void cancelInvitation(invitation.id)}>
                    Annuler
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
