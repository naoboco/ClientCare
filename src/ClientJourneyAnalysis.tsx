import { useEffect, useRef, useState } from 'react'
import { db } from './lib/olimline'
import type { ClientJourney, PortalDocument } from './lib/clientPortal'

export type DocumentStatus = PortalDocument['status']

const statusLabels = {
  missing: 'À fournir',
  rejected: 'À remplacer',
  submitted: 'À vérifier',
  approved: 'Validées',
}
const documentStatuses = Object.keys(statusLabels) as DocumentStatus[]

const actions = {
  confirm_contact: { label: 'Attendre la confirmation des coordonnées' },
  collect_missing: { label: 'Faire le point sur les pièces à fournir', filter: 'missing' },
  collect_replacements: { label: 'Vérifier les pièces à remplacer', filter: 'rejected' },
  review_submissions: { label: 'Examiner les pièces reçues', filter: 'submitted' },
  start_processing: { label: 'Passer en traitement après vérification du dossier' },
  prepare_delivery: { label: 'Suivre la préparation et la livraison' },
  follow_up: { label: 'Faire le point après la livraison' },
} satisfies Record<string, { label: string; filter?: DocumentStatus }>

type Priority = { action: keyof typeof actions; reason: string }

function isPriority(value: unknown): value is Priority {
  return typeof value === 'object' && value !== null && 'action' in value &&
    typeof value.action === 'string' && Object.hasOwn(actions, value.action) &&
    'reason' in value && typeof value.reason === 'string'
}

export default function ClientJourneyAnalysis({
  clientId, journey, documents, contactConfirmed, filter, onFilter, disabled,
}: {
  clientId: string
  journey: ClientJourney
  documents: PortalDocument[]
  contactConfirmed: boolean
  filter: DocumentStatus | null
  onFilter: (status: DocumentStatus | null) => void
  disabled: boolean
}) {
  const [priorities, setPriorities] = useState<Priority[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef<AbortController | null>(null)
  const counts = { missing: 0, rejected: 0, submitted: 0, approved: 0 }
  documents.forEach(item => { counts[item.status] += 1 })

  useEffect(() => () => requestRef.current?.abort(), [])

  async function analyze() {
    if (busy || disabled) return
    const request = new AbortController()
    requestRef.current = request
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(55_000)])
    setBusy(true)
    setPriorities([])
    setError('')
    try {
      const { data, error: authError } = await db().auth.getSession()
      if (authError || !data.session) throw new Error('Reconnectez-vous pour analyser ce dossier.')
      const response = await fetch('/api/analyze-dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
        body: JSON.stringify({ clientId, journeyId: journey.id }),
        signal,
      })
      const result = await response.json().catch(() => null)
      if (request.signal.aborted) return
      if (!response.ok) throw new Error(result?.error || 'L’analyse Gemini est indisponible.')
      if (!result?.snapshot || !Array.isArray(result.priorities) ||
        !result.priorities.length || !result.priorities.every(isPriority)) {
        throw new Error('Les priorités reçues sont incomplètes.')
      }
      if (result.snapshot.stage !== journey.stage || result.snapshot.contactConfirmed !== contactConfirmed ||
        documentStatuses.some(status => result.snapshot.counts?.[status] !== counts[status])) {
        throw new Error('Le dossier a changé. Actualisez le suivi avant de relancer l’analyse.')
      }
      setPriorities(result.priorities)
    } catch (problem) {
      if (!request.signal.aborted) {
        setError(signal.aborted ? 'L’analyse a pris trop de temps. Réessayez.'
          : problem instanceof Error ? problem.message : 'L’analyse Gemini est indisponible.')
      }
    } finally {
      if (!request.signal.aborted) setBusy(false)
    }
  }

  return (
    <div className="cp-journey-analysis">
      <h4>État des pièces</h4>
      <div className="cp-document-filters" role="group" aria-label="Filtrer les pièces du dossier">
        <button type="button" className="cp-button cp-button-secondary" aria-pressed={filter === null}
          aria-controls="cp-staff-documents" onClick={() => onFilter(null)}>Toutes ({documents.length})</button>
        {documentStatuses.map(status => (
          <button key={status} type="button" className="cp-button cp-button-secondary"
            aria-pressed={filter === status} aria-controls="cp-staff-documents"
            onClick={() => onFilter(filter === status ? null : status)}>
            {statusLabels[status]} ({counts[status]})
          </button>
        ))}
      </div>
      <div className="cp-document cp-analysis-priorities" aria-busy={busy}>
        <div className="cp-document-head">
          <h4>Prochaines actions avec Gemini</h4>
          <button type="button" className="cp-button cp-button-secondary" disabled={disabled || busy}
            onClick={() => void analyze()}>{busy ? 'Analyse…' : 'Analyser le dossier'}</button>
        </div>
        <p className="cp-hint">Gemini reçoit uniquement l’étape du dossier, l’état des coordonnées et le nombre de pièces par statut.</p>
        {error && <p className="cp-error" role="alert">{error}</p>}
        {priorities.length > 0 && (
          <ol aria-label="Priorités proposées par Gemini">
            {priorities.map(({ action, reason }) => {
              const item: { label: string; filter?: DocumentStatus } = actions[action]
              return (
                <li key={action}>
                  {item.filter ? (
                    <button type="button" className="cp-button cp-button-secondary"
                      aria-controls="cp-staff-documents" onClick={() => onFilter(item.filter ?? null)}>{item.label}</button>
                  ) : <strong>{item.label}</strong>}
                  <p>{reason}</p>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
