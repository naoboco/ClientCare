import { useEffect, useRef, useState } from 'react'
import { db } from './lib/olimline'

type Analysis = {
  summary: string
  needs: string
  suggested_reply: string
  uncertainties: string[]
}
type History = {
  count: number
  firstAt: string | null
  lastAt: string | null
}
type SavedAnalysis = Analysis & {
  message_count: number
  first_message_at: string | null
  last_message_at: string | null
  reviewed_at: string
}
type Props = {
  clientId: string
  clientEmail: string
  disabled: boolean
}

function historyLabel({ count, firstAt, lastAt }: History) {
  const label = `${count} ${count === 1 ? 'message analysé' : 'messages analysés'}`
  if (!firstAt || !lastAt) return label
  const first = new Date(firstAt).toLocaleDateString('fr-FR')
  const last = new Date(lastAt).toLocaleDateString('fr-FR')
  return first === last ? `${label} le ${last}` : `${label} du ${first} au ${last}`
}

export default function EmailAnalysis({ clientId, clientEmail, disabled }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const [reviewId, setReviewId] = useState('')
  const [previous, setPrevious] = useState<SavedAnalysis | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<'analyze' | 'connect' | 'save' | null>(null)
  const [canConnect, setCanConnect] = useState(false)
  const [error, setError] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [saved, setSaved] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => { controller.current?.abort() }, [])
  useEffect(() => {
    const request = new AbortController()
    async function load() {
      const { data, error } = await db().from('wo_client_email_analyses')
        .select('summary, needs, suggested_reply, uncertainties, message_count, first_message_at, last_message_at, reviewed_at')
        .eq('client_id', clientId).order('reviewed_at', { ascending: false })
        .limit(1).abortSignal(request.signal).maybeSingle()
      if (request.signal.aborted) return
      setLoadError(Boolean(error))
      setPrevious(data)
    }
    void load()
    return () => request.abort()
  }, [clientId])

  async function run(action: 'analyze' | 'connect') {
    if (busy || disabled) return
    const request = new AbortController()
    controller.current = request
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(180_000)])
    setBusy(action)
    setError('')
    setCanConnect(false)
    setAnalysis(null)
    setHistory(null)
    setReviewed(false)
    setSaved(false)
    try {
      const { data, error: sessionError } = await db().auth.getSession()
      if (sessionError || !data.session) throw new Error('Reconnectez-vous pour analyser les échanges.')
      const response = await fetch('/api/analyze-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
        body: JSON.stringify({ clientId, action }),
        signal,
      })
      const payload = await response.json().catch(() => null)
      if (request.signal.aborted) return
      if (!response.ok) {
        setCanConnect(payload?.canConnect === true)
        throw new Error(payload?.error || 'Service d’analyse indisponible (' + response.status + ').')
      }
      if (action === 'connect') {
        const url = new URL(payload?.authorizationUrl)
        if (url.protocol !== 'https:') throw new Error('Le lien de connexion Gmail est invalide.')
        window.location.assign(url.href)
        return
      }
      if (!Number.isInteger(payload?.history?.count) || payload.history.count < 0) {
        throw new Error('Le résultat reçu est incomplet.')
      }
      if (payload.history.count === 0) {
        setHistory(payload.history)
        return
      }
      const result = payload?.analysis
      if (!result || !['summary', 'needs', 'suggested_reply'].every(key =>
        typeof result[key] === 'string') || !Array.isArray(result.uncertainties) ||
        !result.uncertainties.every((item: unknown) => typeof item === 'string')) {
        throw new Error('Le résultat reçu est incomplet.')
      }
      setHistory(payload.history)
      setReviewId(crypto.randomUUID())
      setAnalysis(result as Analysis)
    } catch (reason) {
      if (request.signal.aborted) return
      setError(signal.aborted ? 'La demande a pris trop de temps. Réessayez.'
        : reason instanceof Error ? reason.message : 'Analyse impossible.')
    } finally {
      if (!request.signal.aborted) setBusy(null)
    }
  }

  function edit(field: 'summary' | 'needs' | 'suggested_reply', value: string) {
    setAnalysis(current => current ? { ...current, [field]: value } : null)
    setReviewed(false)
    setError('')
  }

  async function saveAnalysis() {
    if (busy || disabled || saved || !reviewed || !analysis || !history?.count) return
    const summary = analysis.summary.trim()
    const needs = analysis.needs.trim()
    if (!summary || !needs) return
    const request = new AbortController()
    controller.current = request
    setBusy('save')
    setError('')
    try {
      const snapshot = {
        summary,
        needs,
        suggested_reply: analysis.suggested_reply.trim(),
        uncertainties: analysis.uncertainties,
        message_count: history.count,
        first_message_at: history.firstAt,
        last_message_at: history.lastAt,
      }
      const { error } = await db().from('wo_client_email_analyses').upsert({
        id: reviewId,
        client_id: clientId,
        ...snapshot,
      }, { onConflict: 'id', ignoreDuplicates: true }).abortSignal(request.signal)
      if (error) throw error
      if (request.signal.aborted) return
      setSaved(true)
      setPrevious({ ...snapshot, reviewed_at: new Date().toISOString() })
    } catch {
      if (!request.signal.aborted) setError('Impossible d’enregistrer la synthèse. Réessayez.')
    } finally {
      if (!request.signal.aborted) setBusy(null)
    }
  }

  const readOnly = Boolean(busy || disabled || saved)
  return (
    <section className="wo-ai" aria-label="Analyse des échanges Gmail">
      <p className="wo-eyebrow">ASSISTANT GEMINI</p>
      <h3>Historique des échanges</h3>
      <p>Watchover recherche les messages associés à <strong>{clientEmail}</strong> dans la boîte Gmail de l’entreprise. Le texte des échanges est transmis à Gemini pour préparer une synthèse interne à relire.</p>
      <button type="button" className="wo-button wo-primary"
        disabled={Boolean(busy || disabled)} onClick={() => void run('analyze')}>
        {busy === 'analyze' ? 'Analyse en cours…' : 'Analyser les échanges Gmail'}
      </button>
      {busy === 'analyze' && <p role="status">Recherche dans Gmail et préparation de la synthèse…</p>}
      {busy === 'connect' && <p role="status">Ouverture de la connexion Google…</p>}
      {error && <p className="wo-alert" role="alert">{error}</p>}
      {canConnect && (
        <button type="button" className="wo-button wo-quiet" disabled={Boolean(busy || disabled)}
          onClick={() => void run('connect')}>
          Connecter la boîte Gmail
        </button>
      )}
      {loadError && <p className="wo-alert" role="alert">La dernière synthèse enregistrée est indisponible.</p>}
      {history?.count === 0 && <p role="status">Aucun échange trouvé pour cette adresse dans la boîte Gmail connectée.</p>}
      {!analysis && previous && (
        <details className="wo-ai-result">
          <summary>Dernière synthèse enregistrée le {new Date(previous.reviewed_at).toLocaleDateString('fr-FR')}</summary>
          <small>{historyLabel({ count: previous.message_count, firstAt: previous.first_message_at, lastAt: previous.last_message_at })}</small>
          <div><strong>Résumé</strong><p>{previous.summary}</p></div>
          <div><strong>Besoins</strong><p>{previous.needs}</p></div>
          <div><strong>Brouillon de réponse</strong><p>{previous.suggested_reply}</p></div>
          {previous.uncertainties.length > 0 && (
            <div><strong>Points à vérifier</strong>
              <ul>{previous.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
          )}
        </details>
      )}
      {analysis && history && (
        <div className="wo-ai-result">
          <small>{historyLabel(history)} · {saved ? 'Synthèse enregistrée' : 'Synthèse à vérifier'}</small>
          <label>Résumé à corriger si nécessaire
            <textarea rows={3} maxLength={2000} value={analysis.summary}
              disabled={readOnly} onChange={event => edit('summary', event.target.value)} />
          </label>
          <label>Besoins à corriger si nécessaire
            <textarea rows={3} maxLength={2000} value={analysis.needs}
              disabled={readOnly} onChange={event => edit('needs', event.target.value)} />
          </label>
          <label>Brouillon de réponse
            <textarea rows={4} maxLength={2000} value={analysis.suggested_reply}
              disabled={readOnly} onChange={event => edit('suggested_reply', event.target.value)} />
          </label>
          {analysis.uncertainties.length > 0 && (
            <div><strong>Points à vérifier</strong>
              <ul>{analysis.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
          )}
          <label className="wo-ai-confirm">
            <input type="checkbox" checked={reviewed} disabled={readOnly}
              onChange={event => setReviewed(event.target.checked)} />
            J’ai relu et corrigé ces propositions.
          </label>
          <button type="button" className="wo-button wo-primary"
            disabled={readOnly || !reviewed || !analysis.summary.trim() || !analysis.needs.trim()}
            onClick={() => void saveAnalysis()}>
            {busy === 'save' ? 'Enregistrement…' : 'Enregistrer la synthèse interne'}
          </button>
          {saved && <p className="wo-success" role="status">Synthèse interne enregistrée.</p>}
        </div>
      )}
    </section>
  )
}
