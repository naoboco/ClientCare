import { useEffect, useState, type FormEvent } from 'react'
import ClientHousehold from './ClientHousehold'
import ClientJourneyAnalysis, { type DocumentStatus } from './ClientJourneyAnalysis'
import { db } from './lib/olimline'
import {
  clientPortalPath, documentStatuses, downloadPortalDocument, journeyStages, loadClientJourneys,
  loadPortalChecklist, portalCommand, portalDate, portalError, type ClientJourney, type PortalDocument,
} from './lib/clientPortal'
import './ClientPortal.css'

type JourneyData = {
  journey: ClientJourney | undefined
  documents: PortalDocument[]
  contactConfirmed: boolean
  accountLinked: boolean
  holderName: string
}

const portabilityDocumentExamples = [
  'Justificatif d’identité du titulaire',
  'Demande de portabilité signée',
]

async function loadJourney(clientId: string, signal: AbortSignal): Promise<JourneyData> {
  const [journeys, contact] = await Promise.all([
    loadClientJourneys(clientId, signal),
    db().from('wo_clients').select('full_name, portal_contact_confirmed_at, phone, user_id')
      .eq('id', clientId).abortSignal(signal).single(),
  ])
  if (contact.error) throw contact.error
  const journey = journeys.find(item => item.stage !== 'delivered') ?? journeys[0]
  const documents = journey ? await loadPortalChecklist(journey.id, signal) : []
  return {
    journey,
    documents,
    contactConfirmed: Boolean(contact.data.portal_contact_confirmed_at && contact.data.phone.trim()),
    accountLinked: Boolean(contact.data.user_id),
    holderName: contact.data.full_name,
  }
}

function ReviewDocument({ document, disabled, canReview, onReview }: {
  document: PortalDocument
  disabled: boolean
  canReview: boolean
  onReview: (approved: boolean, note: string) => void
}) {
  const [note, setNote] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  async function download() {
    setDownloading(true)
    setError('')
    try {
      await downloadPortalDocument(document)
    } catch (problem) {
      setError(portalError(problem, 'Impossible de télécharger la pièce.'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <li className="cp-document">
      <div className="cp-document-head">
        <strong>{document.label}</strong>
        <span className="cp-pill" data-status={document.status}>{documentStatuses[document.status]}</span>
      </div>
      {document.review_note && <p className="cp-document-note">{document.review_note}</p>}
      {document.file_name && (
        <button type="button" className="cp-button cp-button-secondary"
          disabled={downloading || disabled} onClick={() => void download()}>
          Télécharger {document.file_name}
        </button>
      )}
      {canReview && document.status === 'submitted' && (
        <form className="cp-form" onSubmit={event => {
          event.preventDefault()
          if (note.trim()) onReview(false, note.trim())
        }}>
          <label>Message au client si la pièce doit être remplacée
            <textarea required rows={2} maxLength={500} value={note} disabled={disabled}
              onChange={event => setNote(event.target.value)} />
          </label>
          <div className="cp-actions">
            <button type="button" className="cp-button" disabled={disabled}
              onClick={() => onReview(true, '')}>Valider la pièce</button>
            <button type="submit" className="cp-button cp-button-secondary"
              disabled={disabled || !note.trim()}>Demander un remplacement</button>
          </div>
        </form>
      )}
      {error && <p className="cp-error" role="alert">{error}</p>}
    </li>
  )
}

export default function ClientJourneyManager({ clientId, archived }: { clientId: string; archived: boolean }) {
  const [data, setData] = useState<JourneyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [documentFilter, setDocumentFilter] = useState<DocumentStatus | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    loadJourney(clientId, controller.signal).then(
      result => {
        if (controller.signal.aborted) return
        setData(result)
        setError('')
        setLoading(false)
      },
      problem => {
        if (controller.signal.aborted) return
        setError(portalError(problem, 'Le suivi du dossier est indisponible.'))
        setLoading(false)
      },
    )
    return () => controller.abort()
  }, [clientId, revision])

  function refresh() {
    setLoading(true)
    setRevision(value => value + 1)
  }

  async function change(name: string, parameters: Record<string, string | boolean>, message: string) {
    if (archived || busy || loading) return false
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await portalCommand(name, parameters)
      setNotice(message)
      refresh()
      return true
    } catch (problem) {
      setError(portalError(problem, 'Impossible d’enregistrer cette modification. Actualisez le suivi puis réessayez.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const product = String(new FormData(form).get('product') ?? '').trim()
    const saved = await change('wo_portal_start_journey', {
      p_client_id: clientId, p_product_name: product,
    }, 'Le suivi produit est ouvert dans l’espace client.')
    if (saved) form.reset()
  }

  function addDocument(journeyId: string, label: string) {
    return change('wo_portal_add_document', {
      p_journey_id: journeyId, p_label: label,
    }, 'La liste des pièces est à jour dans l’espace client.')
  }

  async function requireDocument(event: FormEvent<HTMLFormElement>, journeyId: string) {
    event.preventDefault()
    const form = event.currentTarget
    const label = String(new FormData(form).get('label') ?? '').trim()
    const saved = await addDocument(journeyId, label)
    if (saved) form.reset()
  }

  async function copyLink() {
    const url = new URL(import.meta.env.BASE_URL, window.location.origin)
    url.hash = clientPortalPath
    setNotice('')
    setError('')
    try {
      await navigator.clipboard.writeText(url.href)
      setNotice('Lien copié. Le client utilise l’adresse e-mail de sa fiche pour créer son compte ou se connecter.')
    } catch {
      setError('Ouvrez le lien de l’espace client pour copier son adresse.')
    }
  }

  const journey = data?.journey
  const collecting = journey?.stage === 'collecting'
  const disabled = busy || loading || archived
  const ready = Boolean(data?.contactConfirmed && data.documents.every(document => document.status === 'approved'))
  const documents = data?.documents.filter(document => !documentFilter || document.status === documentFilter) ?? []

  return (
    <section className="cp-staff cp-staff-panel" aria-label="Suivi dans l’espace client" aria-busy={loading || busy}>
      <div className="cp-panel-heading">
        <h3>Suivi dans l’espace client</h3>
        <button type="button" className="cp-button cp-button-secondary" disabled={loading || busy}
          onClick={refresh}>Actualiser le suivi</button>
      </div>
      {!archived && data && (
        <div className="cp-document">
          <strong>{data.accountLinked ? 'Compte client lié' : 'Compte client à activer'}</strong>
          <p>{data.accountLinked ? 'Le client se connecte avec l’adresse e-mail de sa fiche.'
            : 'Transmettez le lien au client pour qu’il crée et confirme son compte avec l’adresse e-mail de sa fiche.'}</p>
        </div>
      )}
      <div className="cp-actions">
        <button type="button" className="cp-button cp-button-secondary" onClick={() => void copyLink()}>
          Copier le lien client
        </button>
        <a className="cp-button cp-button-secondary" href={clientPortalPath} target="_blank" rel="noreferrer">
          Ouvrir l’espace client
        </a>
      </div>
      {error && <p className="cp-error" role="alert">{error}</p>}
      {notice && <p className="cp-notice" role="status">{notice}</p>}
      {!data && loading && <p role="status">Chargement du suivi…</p>}
      {data && (
        <>
          {journey && (
            <div className="cp-document">
              <div className="cp-document-head">
                <strong>{journey.product_name}</strong>
                <span className="cp-pill" data-status={journey.stage}>{journeyStages[journey.stage]}</span>
              </div>
              {journey.delivered_at && <p>Livré le {portalDate(journey.delivered_at)}</p>}
              {journey.stage !== 'delivered' && (
                <p>{data.contactConfirmed ? 'Coordonnées confirmées par le client.' : 'Coordonnées à confirmer par le client.'}</p>
              )}
            </div>
          )}
          {!journey && <p className="cp-hint">Aucun suivi produit ouvert.</p>}
          {!archived && (!journey || journey.stage === 'delivered') && (
            <form className="cp-form cp-inline-form" onSubmit={start}>
              <label>Produit à livrer
                <input required maxLength={160} name="product" disabled={disabled} />
              </label>
              <button className="cp-button" type="submit" disabled={disabled}>Ouvrir le suivi</button>
            </form>
          )}
          {journey && (
            <>
              <ClientJourneyAnalysis key={journey.id + ':' + revision} clientId={clientId} journey={journey}
                documents={data.documents} contactConfirmed={data.contactConfirmed} disabled={disabled}
                filter={documentFilter} onFilter={setDocumentFilter} />
              <div id="cp-staff-documents" aria-label="Liste des pièces du dossier">
                {documents.length ? (
                  <ul className="cp-document-list">
                    {documents.map(document => (
                      <ReviewDocument key={document.storage_path} document={document}
                        disabled={loading || busy} canReview={collecting && !archived}
                        onReview={(approved, note) => void change('wo_portal_review_document', {
                          p_document_id: document.id, p_storage_path: document.storage_path,
                          p_approved: approved, p_note: note,
                        }, approved ? 'Pièce validée.' : 'Le client peut déposer une pièce de remplacement.')} />
                    ))}
                  </ul>
                ) : <p className="cp-hint">{documentFilter ? 'Aucune pièce à ce statut.' : 'Aucune pièce demandée.'}</p>}
              </div>
            </>
          )}
          {journey && collecting && !archived && (
            <>
              <form className="cp-form cp-inline-form" onSubmit={event => void requireDocument(event, journey.id)}>
                <label>Pièce à demander
                  <input required maxLength={120} name="label" disabled={disabled} />
                </label>
                <button className="cp-button cp-button-secondary" type="submit" disabled={disabled}>Demander la pièce</button>
              </form>
              <p className="cp-hint">Exemples de pièces si le client conserve son numéro. Ajoutez celles demandées par l’opérateur.</p>
              <div className="cp-actions">
                {portabilityDocumentExamples.map(label => (
                  <button key={label} type="button" className="cp-button cp-button-secondary"
                    disabled={disabled || data.documents.some(document => document.label.toLowerCase() === label.toLowerCase())}
                    onClick={() => void addDocument(journey.id, label)}>{label}</button>
                ))}
              </div>
            </>
          )}
          {journey && journey.stage !== 'delivered' && !archived && (
            <>
              {!ready && <p className="cp-hint">Confirmez les pièces reçues et attendez les coordonnées du client pour passer à la livraison.</p>}
              <div className="cp-actions">
                <button className="cp-button" type="button" disabled={disabled || !ready}
                  onClick={() => void change('wo_portal_set_stage', {
                    p_journey_id: journey.id, p_stage: collecting ? 'processing' : 'delivered',
                  }, collecting ? 'Le produit est en préparation.' : 'La livraison est confirmée.')}>
                  {collecting ? 'Passer en traitement' : 'Confirmer la livraison'}
                </button>
                {!collecting && (
                  <button className="cp-button cp-button-secondary" type="button" disabled={disabled}
                    onClick={() => void change('wo_portal_set_stage', {
                      p_journey_id: journey.id, p_stage: 'collecting',
                    }, 'La collecte des pièces est rouverte.')}>Rouvrir la collecte</button>
                )}
              </div>
            </>
          )}
          <ClientHousehold clientId={clientId} holderName={data.holderName} journey={journey} revision={revision} />
        </>
      )}
    </section>
  )
}
