import { useEffect, useRef, useState, type FormEvent } from 'react'
import ClientHousehold from './ClientHousehold'
import { db } from './lib/olimline'
import {
  documentFileTypes, documentStatuses, downloadPortalDocument, journeyStages, loadClientJourneys,
  loadPortalChecklist, loadPortalContact, portalCommand, portalDate, portalError,
  requestFields, requestKinds, requestStatuses, submitPortalDocument,
  type ClientJourney, type ClientRequest, type PortalContact, type PortalDocument, type RequestKind,
} from './lib/clientPortal'
import './ClientPortal.css'

type PortalData = {
  contact: PortalContact
  journey: ClientJourney | undefined
  delivered: ClientJourney | undefined
  documents: PortalDocument[]
  requests: ClientRequest[]
}

type PortalProps = {
  onLogout: () => Promise<void>
  logoutBusy: boolean
  logoutError: string
}

async function loadPortal(signal: AbortSignal): Promise<PortalData | null> {
  const contact = await loadPortalContact(signal)
  if (!contact) return null

  const [journeys, requests] = await Promise.all([
    loadClientJourneys(contact.id, signal),
    db().from('wo_client_requests').select(requestFields).eq('client_id', contact.id)
      .order('created_at', { ascending: false }).limit(100).abortSignal(signal),
  ])
  if (requests.error) throw requests.error

  const delivered = journeys.find(item => item.stage === 'delivered')
  const journey = journeys.find(item => item.stage !== 'delivered') ?? delivered
  const documents = journey ? await loadPortalChecklist(journey.id, signal) : []

  return { contact, journey, delivered, documents, requests: (requests.data ?? []) as ClientRequest[] }
}

function Progress({ journey, contact, documents }: Pick<PortalData, 'journey' | 'contact' | 'documents'>) {
  const delivered = journey?.stage === 'delivered'
  const processing = journey?.stage === 'processing'
  const needsDocument = documents.filter(document => document.status === 'missing' || document.status === 'rejected')
  const pendingReview = documents.filter(document => document.status === 'submitted').length
  const documentsReady = Boolean(journey) && documents.every(document => document.status === 'approved')
  const completed = delivered ? 4 : processing ? 2 : contact.contact_confirmed ? (documentsReady ? 2 : 1) : 0
  const steps = ['Coordonnées', 'Documents', 'Traitement', 'Livraison']

  return (
    <section className="cp-panel cp-progress" aria-labelledby="cp-progress-heading">
      <div className="cp-panel-heading">
        <div>
          <h2 id="cp-progress-heading">Suivi du dossier</h2>
          {journey && <p>{journey.product_name}</p>}
        </div>
        {journey && <span className="cp-pill" data-status={journey.stage}>{journeyStages[journey.stage]}</span>}
      </div>

      <ol className="cp-steps" aria-label="Étapes du dossier">
        {steps.map((step, index) => (
          <li key={step} data-state={index < completed ? 'complete' : index === completed ? 'current' : 'pending'}
            aria-current={index === completed ? 'step' : undefined}>
            <span className="cp-step-marker" aria-hidden="true">{index < completed ? '✓' : index + 1}</span>
            <span>{step}{index < completed && <span className="cp-sr-only">, terminé</span>}</span>
          </li>
        ))}
      </ol>

      {!journey && <p className="cp-progress-note">Le produit et les pièces à fournir apparaîtront ici dès que l’équipe ouvrira votre suivi.</p>}
      {journey?.stage === 'collecting' && (
        <p className="cp-progress-note">
          {!contact.contact_confirmed && <>Confirmez vos coordonnées. </>}
          {needsDocument.length > 0 && (
            <>{needsDocument.length} {needsDocument.length === 1 ? 'pièce est à fournir ou à remplacer.' : 'pièces sont à fournir ou à remplacer.'} </>
          )}
          {pendingReview > 0 && (
            <>{pendingReview} {pendingReview === 1 ? 'pièce est en cours de vérification.' : 'pièces sont en cours de vérification.'} </>
          )}
          {contact.contact_confirmed && documentsReady && <>Votre dossier attend sa mise en traitement par l’équipe.</>}
        </p>
      )}
      {processing && <p className="cp-progress-note">Vos coordonnées et pièces sont validées. L’équipe prépare votre produit.</p>}
      {journey?.delivered_at && <p className="cp-progress-note">Livraison confirmée le {portalDate(journey.delivered_at)}.</p>}
    </section>
  )
}

function ContactForm({ contact, disabled, onChanged }: {
  contact: PortalContact
  disabled: boolean
  onChanged: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || disabled) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')

    try {
      await portalCommand('wo_portal_save_contact', {
        p_full_name: String(form.get('name') ?? '').trim(),
        p_phone: String(form.get('phone') ?? '').trim(),
      })
      onChanged('Vos coordonnées sont enregistrées.')
    } catch (problem) {
      setError(portalError(problem, 'Impossible d’enregistrer vos coordonnées. Réessayez.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="cp-panel" aria-labelledby="cp-contact-heading">
      <div className="cp-panel-heading">
        <h2 id="cp-contact-heading">Mes coordonnées</h2>
        {contact.contact_confirmed && <span className="cp-pill" data-status="approved">Confirmées</span>}
      </div>
      <form className="cp-form" onSubmit={save} aria-busy={busy}>
        <label>Nom complet
          <input name="name" autoComplete="name" required maxLength={160} defaultValue={contact.full_name} disabled={busy || disabled} />
        </label>
        <label>Adresse e-mail du compte
          <input type="email" value={contact.email} readOnly />
        </label>
        <label>Téléphone
          <input name="phone" type="tel" autoComplete="tel" required maxLength={60} defaultValue={contact.phone} disabled={busy || disabled} />
        </label>
        {error && <p className="cp-error" role="alert">{error}</p>}
        <button type="submit" className="cp-button" disabled={busy || disabled}>
          {busy ? 'Enregistrement…' : contact.contact_confirmed ? 'Enregistrer mes coordonnées' : 'Confirmer mes coordonnées'}
        </button>
      </form>
    </section>
  )
}

function ClientDocument({ document, collecting, disabled, onChanged }: {
  document: PortalDocument
  collecting: boolean
  disabled: boolean
  onChanged: (message?: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canUpload = collecting && (document.status === 'missing' || document.status === 'rejected')

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || disabled) return
    setBusy(true)
    setError('')
    try {
      await submitPortalDocument(document, file)
      onChanged('Le document est déposé et attend sa vérification.')
    } catch (problem) {
      setError(portalError(problem, 'Impossible de déposer le document. Réessayez.'))
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    setBusy(true)
    setError('')
    try {
      await downloadPortalDocument(document)
    } catch (problem) {
      setError(portalError(problem, 'Impossible de télécharger le document.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="cp-document">
      <div className="cp-document-head">
        <strong>{document.label}</strong>
        <span className="cp-pill" data-status={document.status}>{documentStatuses[document.status]}</span>
      </div>
      {document.review_note && <p className="cp-document-note">{document.review_note}</p>}
      {canUpload && (
        <form className="cp-upload" onSubmit={upload} aria-busy={busy}>
          {document.upload_received ? <p>Fichier transféré. Finalisez le dépôt pour l’envoyer à l’équipe.</p> : (
            <label>
              <span className="cp-sr-only">Fichier pour {document.label}</span>
              <input type="file" accept={documentFileTypes} required disabled={busy || disabled}
                onChange={event => setFile(event.target.files?.[0] ?? null)} />
            </label>
          )}
          <button type="submit" className="cp-button cp-button-secondary"
            disabled={busy || disabled || (!document.upload_received && !file)}>
            {busy ? 'Dépôt…' : document.upload_received ? 'Finaliser le dépôt' : 'Déposer'}
          </button>
        </form>
      )}
      {document.file_name && (
        <button type="button" className="cp-button cp-button-secondary"
          disabled={busy || disabled} onClick={() => void download()}>
          Télécharger {document.file_name}
        </button>
      )}
      {error && <p className="cp-error" role="alert">{error}</p>}
    </li>
  )
}

function RequestForm({ contact, currentProduct, disabled, onChanged }: {
  contact: PortalContact
  currentProduct: string
  disabled: boolean
  onChanged: (message: string) => void
}) {
  const [kind, setKind] = useState<RequestKind>('new_product')
  const [product, setProduct] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attempt = useRef<{ id: string; content: string } | null>(null)

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || disabled) return
    setError('')
    if (!product.trim() || !description.trim()) {
      setError('Renseignez le produit et expliquez votre demande.')
      return
    }
    const content = JSON.stringify([kind, product.trim(), description.trim()])
    if (attempt.current?.content !== content) attempt.current = { id: crypto.randomUUID(), content }
    const id = attempt.current.id
    setBusy(true)

    try {
      const { error: writeError } = await db().from('wo_client_requests').upsert({
        id,
        client_id: contact.id,
        kind,
        product_name: product.trim(),
        description: description.trim(),
      }, { onConflict: 'id', ignoreDuplicates: true })
      if (writeError) throw writeError

      attempt.current = null
      setProduct(kind === 'technical_issue' ? currentProduct : '')
      setDescription('')
      onChanged(contact.coordinator_name
        ? 'Votre demande a été transmise à votre coordinateur.'
        : 'Votre demande est enregistrée. L’équipe va l’attribuer à un coordinateur.')
    } catch (problem) {
      setError(portalError(problem, 'Impossible d’envoyer votre demande. Vous pouvez réessayer.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="cp-form" onSubmit={send} aria-busy={busy}>
      <label>Type de demande
        <select value={kind} disabled={busy || disabled} onChange={event => {
          const next = event.target.value as RequestKind
          setKind(next)
          setProduct(next === 'technical_issue' ? currentProduct : '')
        }}>
          {Object.entries(requestKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>{kind === 'technical_issue' ? 'Produit concerné' : 'Produit souhaité'}
        <input required maxLength={160} disabled={busy || disabled} value={product}
          onChange={event => setProduct(event.target.value)} />
      </label>
      <label>{kind === 'technical_issue' ? 'Décrivez le problème' : 'Précisez votre besoin'}
        <textarea rows={4} required maxLength={3000} disabled={busy || disabled} value={description}
          onChange={event => setDescription(event.target.value)} />
      </label>
      {error && <p className="cp-error" role="alert">{error}</p>}
      <button type="submit" className="cp-button" disabled={busy || disabled}>
        {busy ? 'Envoi…' : 'Envoyer ma demande'}
      </button>
    </form>
  )
}

export default function ClientPortal({ onLogout, logoutBusy, logoutError }: PortalProps) {
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    loadPortal(controller.signal).then(
      result => {
        if (!controller.signal.aborted) {
          setData(result)
          setError('')
          setLoading(false)
        }
      },
      problem => {
        if (!controller.signal.aborted) {
          setError(portalError(problem, 'Votre dossier est indisponible. Actualisez la page pour réessayer.'))
          setLoading(false)
        }
      },
    )
    return () => controller.abort()
  }, [revision])

  function refresh(message = '') {
    setNotice(message)
    setLoading(true)
    setRevision(value => value + 1)
  }

  const approvedDocuments = data?.documents.filter(document => document.status === 'approved').length ?? 0

  return (
    <div className="cp-portal">
      <header className="cp-topbar">
        <div className="cp-topbar-inner">
          <a className="cp-brand" href="#/olimline" aria-label="Site Olimline">olim<span>line.</span></a>
          <span className="cp-topbar-label">Espace client</span>
          <div className="cp-topbar-actions">
            <button type="button" className="cp-button cp-button-secondary"
              disabled={loading} onClick={() => refresh()}>Actualiser</button>
            <button type="button" className="cp-button cp-button-secondary" disabled={logoutBusy}
              onClick={() => void onLogout()}>{logoutBusy ? 'Déconnexion…' : 'Se déconnecter'}</button>
          </div>
        </div>
      </header>

      <main className="cp-main" aria-busy={loading}>
        {logoutError && <p className="cp-error" role="alert">{logoutError}</p>}
        {error && <p className="cp-error" role="alert">{error}</p>}
        {notice && <p className="cp-notice" role="status">{notice}</p>}
        {!data && loading && <p className="cp-panel" role="status">Chargement de votre dossier…</p>}
        {!data && !loading && !error && (
          <section className="cp-panel">
            <h1>Mon dossier Olimline</h1>
            <p>Votre dossier n’est pas accessible avec ce compte. Vérifiez l’adresse e-mail utilisée pour votre dossier ou contactez Olimline.</p>
          </section>
        )}

        {data && (
          <>
            <div className="cp-hero">
              <div>
                <h1>Bonjour, {data.contact.full_name}</h1>
                <p>Retrouvez votre dossier, vos documents et vos demandes.</p>
              </div>
              <div className="cp-coordinator">
                <span>Votre coordinateur</span>
                <strong>{data.contact.coordinator_name ?? 'Attribution en cours'}</strong>
              </div>
            </div>

            <Progress journey={data.journey} contact={data.contact} documents={data.documents} />

            <div className="cp-columns">
              <ContactForm key={data.contact.id} contact={data.contact} disabled={loading} onChanged={refresh} />
              <section className="cp-panel" aria-labelledby="cp-documents-heading">
                <div className="cp-panel-heading">
                  <h2 id="cp-documents-heading">Mes documents</h2>
                  {data.documents.length > 0 && (
                    <span className="cp-pill" aria-live="polite">
                      {approvedDocuments} sur {data.documents.length} pièces validées
                    </span>
                  )}
                </div>
                {data.documents.length > 0 ? (
                  <>
                    {data.journey?.stage === 'collecting' && <p className="cp-hint">PDF, JPG ou PNG, jusqu’à 10 Mo par fichier.</p>}
                    <ul className="cp-document-list">
                      {data.documents.map(document => (
                        <ClientDocument key={document.storage_path} document={document}
                          collecting={data.journey?.stage === 'collecting'} disabled={loading} onChanged={refresh} />
                      ))}
                    </ul>
                  </>
                ) : <p className="cp-hint">Aucun document demandé pour le moment.</p>}
              </section>
            </div>

            <ClientHousehold key={data.contact.id} clientId={data.contact.id} holderName={data.contact.full_name}
              journey={data.journey} revision={revision} editable disabled={loading} />

            <div className="cp-columns">
              <section className="cp-panel" aria-labelledby="cp-new-request-heading">
                <h2 id="cp-new-request-heading">Faire une demande</h2>
                <RequestForm contact={data.contact}
                  currentProduct={data.delivered?.product_name ?? data.journey?.product_name ?? ''}
                  disabled={loading} onChanged={refresh} />
              </section>
              <section className="cp-panel" aria-labelledby="cp-requests-heading">
                <h2 id="cp-requests-heading">Mes demandes</h2>
                {data.requests.length > 0 ? (
                  <ul className="cp-document-list">
                    {data.requests.map(request => (
                      <li key={request.id} className="cp-document">
                        <div className="cp-document-head">
                          <strong>{request.product_name}</strong>
                          <span className="cp-pill" data-status={request.status}>{requestStatuses[request.status]}</span>
                        </div>
                        <p className="cp-hint">{requestKinds[request.kind]} · {portalDate(request.created_at)}</p>
                        <p className="cp-prewrap">{request.description}</p>
                        {request.reply && (
                          <div className="cp-reply">
                            <strong>Réponse de l’équipe</strong>
                            <p className="cp-prewrap">{request.reply}</p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : <p className="cp-hint">Vous n’avez encore envoyé aucune demande.</p>}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
