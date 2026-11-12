import { useEffect, useState, type FormEvent } from 'react'
import { db } from './lib/olimline'
import {
  portalDate, portalError, requestFields, requestKinds, requestStatuses, type ClientRequest, type RequestStatus,
} from './lib/clientPortal'
import './ClientPortal.css'

type InboxRequest = ClientRequest & {
  client: { full_name: string; coordinator_id: string | null; archived_at: string | null } | null
}
type Filter = 'open' | 'resolved' | 'all'
const pageSize = 25

function StaffRequest({ request, onSaved, onOpenClient, loading }: {
  request: InboxRequest
  onSaved: () => void
  onOpenClient: (id: string) => Promise<void>
  loading: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(request.status)
  const [reply, setReply] = useState(request.reply)
  const archived = Boolean(request.client?.archived_at)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || loading || archived) return
    setBusy(true)
    setError('')

    try {
      const { data, error: problem } = await db().from('wo_client_requests')
        .update({ status, reply: reply.trim() })
        .eq('id', request.id).eq('updated_at', request.updated_at)
        .select('id').maybeSingle()
      if (problem) throw problem
      if (!data) throw new Error('La demande a changé ou a été réattribuée. Actualisez la liste.')
      onSaved()
    } catch (problem) {
      setError(portalError(problem, 'Impossible d’enregistrer la réponse. Réessayez.'))
    } finally {
      setBusy(false)
    }
  }

  async function open() {
    if (busy || loading) return
    setBusy(true)
    setError('')
    try {
      await onOpenClient(request.client_id)
    } catch (problem) {
      setError(portalError(problem, 'Impossible d’ouvrir le dossier client.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="cp-panel">
      <div className="cp-panel-heading">
        <div>
          <h3>{request.product_name}</h3>
          <p>{requestKinds[request.kind]} · {portalDate(request.created_at)}</p>
        </div>
        <span className="cp-pill" data-status={request.status}>{requestStatuses[request.status]}</span>
      </div>
      <p className="cp-hint">
        {request.client?.full_name ?? 'Dossier client'}
        {request.client && !request.client.coordinator_id && ' · À attribuer'}
        {archived && ' · Fiche archivée'}
      </p>
      <p className="cp-prewrap">{request.description}</p>
      <button className="cp-button cp-button-secondary" type="button"
        disabled={busy || loading} onClick={() => void open()}>Ouvrir la fiche</button>

      {!archived ? (
        <form className="cp-form" onSubmit={save} aria-busy={busy}>
          <label>Statut de la demande
            <select value={status} disabled={busy || loading}
              onChange={event => setStatus(event.target.value as RequestStatus)}>
              {Object.entries(requestStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Réponse visible par le client
            <textarea rows={3} value={reply} maxLength={2000} disabled={busy || loading}
              onChange={event => setReply(event.target.value)} />
          </label>
          <button className="cp-button" type="submit"
            disabled={busy || loading || (status === request.status && reply.trim() === request.reply)}>
            {busy ? 'Enregistrement…' : 'Enregistrer le suivi'}
          </button>
        </form>
      ) : request.reply && (
        <div className="cp-reply"><strong>Réponse de l’équipe</strong><p className="cp-prewrap">{request.reply}</p></div>
      )}
      {error && <p className="cp-error" role="alert">{error}</p>}
    </li>
  )
}

export default function ClientRequestsInbox({ onOpenClient }: {
  onOpenClient: (id: string) => Promise<void>
}) {
  const [filter, setFilter] = useState<Filter>('open')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [rows, setRows] = useState<InboxRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [hasNextPage, setHasNextPage] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      let query = db().from('wo_client_requests')
        .select(requestFields + ', client:wo_clients(full_name, coordinator_id, archived_at)')
      if (filter === 'open') query = query.neq('status', 'resolved')
      if (filter === 'resolved') query = query.eq('status', 'resolved')

      const { data, error: problem } = await query.order('created_at', { ascending: false })
        .order('id', { ascending: false }).range(page * pageSize, (page + 1) * pageSize)
        .abortSignal(controller.signal)
      if (problem) throw problem

      if (!controller.signal.aborted) {
        const items = (data ?? []) as unknown as InboxRequest[]
        setRows(items.slice(0, pageSize))
        setHasNextPage(items.length > pageSize)
        setError('')
        setLoading(false)
      }
    }

    load().catch(problem => {
      if (controller.signal.aborted) return
      setError(portalError(problem, 'Impossible de charger les demandes.'))
      setLoading(false)
    })
    return () => controller.abort()
  }, [filter, page, revision])

  function refresh(message = '') {
    setLoading(true)
    setNotice(message)
    setRevision(value => value + 1)
  }

  return (
    <section className="cp-staff cp-inbox" aria-labelledby="cp-inbox-heading" aria-busy={loading}>
      <div className="cp-panel-heading">
        <h2 id="cp-inbox-heading">Demandes clients</h2>
        <div className="cp-actions">
          <div className="cp-form">
            <label>Afficher les demandes
              <select value={filter} disabled={loading} onChange={event => {
                setLoading(true)
                setNotice('')
                setPage(0)
                setFilter(event.target.value as Filter)
              }}>
                <option value="open">À traiter</option>
                <option value="resolved">Résolues</option>
                <option value="all">Toutes</option>
              </select>
            </label>
          </div>
          <button type="button" className="cp-button cp-button-secondary" disabled={loading}
            onClick={() => refresh()}>Actualiser les demandes</button>
        </div>
      </div>
      {error && <p className="cp-error" role="alert">{error}</p>}
      {notice && <p className="cp-notice" role="status">{notice}</p>}
      {loading && !rows.length && <p role="status">Chargement des demandes…</p>}
      {!loading && !error && !rows.length && <p className="cp-panel">Aucune demande pour ce filtre.</p>}
      {rows.length > 0 && (
        <ul className="cp-document-list">
          {rows.map(request => (
            <StaffRequest key={request.id + request.updated_at} request={request} loading={loading}
              onOpenClient={onOpenClient} onSaved={() => refresh('Demande mise à jour dans l’espace client.')} />
          ))}
        </ul>
      )}
      {(page > 0 || hasNextPage) && (
        <div className="cp-actions" aria-label="Pages des demandes">
          <button type="button" className="cp-button cp-button-secondary" disabled={loading || page === 0}
            onClick={() => { setLoading(true); setPage(value => value - 1) }}>Précédent</button>
          <span>Page {page + 1}</span>
          <button type="button" className="cp-button cp-button-secondary" disabled={loading || !hasNextPage}
            onClick={() => { setLoading(true); setPage(value => value + 1) }}>Suivant</button>
        </div>
      )}
    </section>
  )
}
