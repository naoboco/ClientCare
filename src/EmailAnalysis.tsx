import { useEffect, useRef, useState } from 'react'
import { db } from './lib/olimline'

type Analysis = {
  summary: string
  needs: string
  suggested_reply: string
  uncertainties: string[]
}
type Props = {
  clientId: string
  disabled: boolean
  onApply: (text: string) => boolean
}

export default function EmailAnalysis({ clientId, disabled, onApply }: Props) {
  const [email, setEmail] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [applied, setApplied] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => { controller.current?.abort() }, [])

  async function analyze() {
    if (busy || disabled || email.trim().length < 10) return
    const request = new AbortController()
    controller.current = request
    const timeout = window.setTimeout(() => request.abort(), 35_000)
    setBusy(true)
    setError('')
    setAnalysis(null)
    setReviewed(false)
    setApplied(false)
    try {
      const { data, error: sessionError } = await db().auth.getSession()
      if (sessionError || !data.session) throw new Error('Reconnectez-vous pour analyser cet email.')
      const response = await fetch('/api/analyze-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
        body: JSON.stringify({ clientId, emailText: email }),
        signal: request.signal,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Service IA indisponible (' + response.status + ').')
      const result = payload?.analysis
      if (!result || !['summary', 'needs', 'suggested_reply'].every(key =>
        typeof result[key] === 'string') || !Array.isArray(result.uncertainties) ||
        !result.uncertainties.every((item: unknown) => typeof item === 'string')) {
        throw new Error('Le résultat reçu est incomplet.')
      }
      if (request.signal.aborted) return
      setAnalysis(result as Analysis)
      setModel(String(payload.model || 'Gemini'))
    } catch (reason) {
      if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : 'Analyse impossible.')
      else setError('L’analyse a été interrompue. Réessayez.')
    } finally {
      window.clearTimeout(timeout)
      setBusy(false)
    }
  }

  function edit(field: 'summary' | 'needs' | 'suggested_reply', value: string) {
    setAnalysis(current => current ? { ...current, [field]: value } : null)
    setReviewed(false)
    setApplied(false)
  }

  return (
    <section className="wo-ai" aria-label="Analyse d’email avec Gemini">
      <p className="wo-eyebrow">ASSISTANT GEMINI</p>
      <h3>Préparer le prochain échange</h3>
      <p>Collez un email fictif. Son texte sera envoyé à Gemini pour proposer une analyse à relire.</p>
      <label>Email à analyser
        <textarea rows={5} maxLength={6000} disabled={busy || disabled}
          value={email} placeholder="Bonjour, je cherche un forfait avec davantage de données…"
          onChange={event => {
            setEmail(event.target.value); setAnalysis(null); setReviewed(false); setApplied(false); setError('')
          }}
        />
      </label>
      <button type="button" className="wo-button wo-primary"
        disabled={busy || disabled || email.trim().length < 10} onClick={() => void analyze()}>
        {busy ? 'Analyse en cours…' : 'Analyser avec Gemini'}
      </button>
      {busy && <p role="status">Gemini analyse le texte fourni…</p>}
      {error && <p className="wo-alert" role="alert">{error}</p>}
      {analysis && (
        <div className="wo-ai-result">
          <small>Proposition de {model} · À vérifier</small>
          <label>Résumé à corriger si nécessaire
            <textarea rows={3} maxLength={2000} value={analysis.summary}
              disabled={disabled || applied} onChange={event => edit('summary', event.target.value)} />
          </label>
          <label>Besoins à corriger si nécessaire
            <textarea rows={3} maxLength={2000} value={analysis.needs}
              disabled={disabled || applied} onChange={event => edit('needs', event.target.value)} />
          </label>
          <label>Brouillon de réponse
            <textarea rows={4} maxLength={2000} value={analysis.suggested_reply}
              disabled={disabled || applied} onChange={event => edit('suggested_reply', event.target.value)} />
          </label>
          {analysis.uncertainties.length > 0 && (
            <div><strong>Points à vérifier</strong>
              <ul>{analysis.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
          )}
          <label className="wo-ai-confirm">
            <input type="checkbox" checked={reviewed} disabled={disabled || applied}
              onChange={event => setReviewed(event.target.checked)} />
            J’ai relu et corrigé ces propositions.
          </label>
          <button type="button" className="wo-button wo-primary"
            disabled={disabled || !reviewed || applied || !analysis.summary.trim() || !analysis.needs.trim()}
            onClick={() => {
              const text = 'Analyse email relue le ' + new Date().toLocaleString('fr-FR') +
                '\nRésumé : ' + analysis.summary.trim() + '\nBesoins : ' + analysis.needs.trim() +
                '\nRéponse proposée : ' + analysis.suggested_reply.trim()
              if (onApply(text)) setApplied(true)
            }}>
            {applied ? 'Ajouté aux notes de la fiche' : 'Ajouter les informations validées aux notes'}
          </button>
          {applied && <p className="wo-success" role="status">
            Les notes sont préparées. Cliquez sur « Enregistrer les modifications » dans la fiche pour les sauvegarder.
          </p>}
        </div>
      )}
    </section>
  )
}
