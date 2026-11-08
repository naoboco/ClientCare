import { useEffect, useState, type FormEvent } from 'react'
import ClientImport from './ClientImport'
import { db } from './lib/olimline'
import { crmQuestionnairePath } from './lib/staffAccess'
import './WorkspaceSettings.css'

type AiProvider = '' | 'gemini' | 'claude' | 'openai'

type Preferences = {
  communication_ai: AiProvider
  analysis_ai: AiProvider
  gmail_address: string
  outlook_address: string
  whatsapp_number: string
  business_activity: string
  analysis_goals: string
}

const emptyPreferences: Preferences = {
  communication_ai: '',
  analysis_ai: '',
  gmail_address: '',
  outlook_address: '',
  whatsapp_number: '',
  business_activity: '',
  analysis_goals: '',
}

function AiChoice({ label, value, onChange }: {
  label: string
  value: AiProvider
  onChange: (value: AiProvider) => void
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={event => onChange(event.target.value as AiProvider)}>
        <option value="">À définir</option>
        <option value="gemini">Google Gemini</option>
        <option value="claude">Anthropic Claude</option>
        <option value="openai">OpenAI</option>
      </select>
    </label>
  )
}

export default function WorkspaceSettings({ organizationId, onImported }: {
  organizationId: string
  onImported: () => void
}) {
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'loadError' | 'saveError'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    const request = new AbortController()

    async function loadPreferences() {
      try {
        const { data, error } = await db().from('wo_workspace_settings')
          .select('communication_ai, analysis_ai, gmail_address, outlook_address, whatsapp_number, business_activity, analysis_goals')
          .eq('organization_id', organizationId)
          .abortSignal(request.signal)
          .maybeSingle()

        if (request.signal.aborted) return
        if (error) throw error
        setPreferences(data ? data as Preferences : emptyPreferences)
        setStatus('idle')
      } catch {
        if (!request.signal.aborted) setStatus('loadError')
      }
    }

    void loadPreferences()
    return () => request.abort()
  }, [organizationId, loadAttempt])

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences(current => current && { ...current, [key]: value })
    setStatus('idle')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!preferences || status === 'saving') return
    setStatus('saving')

    try {
      const { error } = await db().from('wo_workspace_settings')
        .upsert({ ...preferences, organization_id: organizationId }, { onConflict: 'organization_id' })
      if (error) throw error
      setStatus('saved')
    } catch {
      setStatus('saveError')
    }
  }

  return (
    <div className="wo-setup">
      <section className="wo-welcome">
        <div>
          <p className="wo-eyebrow">ADMINISTRATION</p>
          <h1>Configuration de l’entreprise</h1>
          <p>Choisissez les assistants souhaités, les canaux à raccorder et les clients à importer.</p>
          <a className="wo-button wo-primary wo-setup-questionnaire" href={crmQuestionnairePath}>Ouvrir le questionnaire CRM</a>
        </div>
        <span className="wo-welcome-mark" aria-hidden="true">W.</span>
      </section>

      {status === 'loading' && <p role="status">Chargement de la configuration…</p>}
      {status === 'loadError' && (
        <div>
          <p className="wo-alert" role="alert">Impossible de charger la configuration de l’entreprise.</p>
          <button type="button" className="wo-button wo-quiet" onClick={() => {
            setStatus('loading')
            setLoadAttempt(attempt => attempt + 1)
          }}>Réessayer</button>
        </div>
      )}

      {preferences && (
        <form className="wo-form" onSubmit={save} aria-busy={status === 'saving'}>
          <fieldset className="wo-setup-fields" disabled={status === 'saving'}>
            <section className="wo-detail wo-form" aria-labelledby="wo-assistants-title">
              <div>
                <p className="wo-eyebrow">ASSISTANTS</p>
                <h2 id="wo-assistants-title">Une IA par mission</h2>
                <p className="wo-setup-description">
                  Les choix enregistrent vos préférences pour le raccordement des assistants.
                  L’analyse Gmail est disponible dans Olimline avec Gemini.
                </p>
              </div>
              <div className="wo-form-grid">
                <div className="wo-setup-mission">
                  <h3>Communication</h3>
                  <p>Résumés des échanges, besoins des clients et brouillons de réponse.</p>
                  <AiChoice label="IA souhaitée pour les échanges" value={preferences.communication_ai}
                    onChange={value => update('communication_ai', value)} />
                </div>
                <div className="wo-setup-mission">
                  <h3>Pilotage</h3>
                  <p>Indicateurs de performance, analyses métier et veille adaptée à votre activité.</p>
                  <AiChoice label="IA souhaitée pour les analyses" value={preferences.analysis_ai}
                    onChange={value => update('analysis_ai', value)} />
                </div>
              </div>
              <div className="wo-form-grid">
                <label>
                  Activité de l’entreprise
                  <input maxLength={120} value={preferences.business_activity}
                    onChange={event => update('business_activity', event.target.value)}
                    placeholder="Téléphonie, association, commerce…" />
                </label>
                <label>
                  Priorités d’analyse
                  <textarea rows={3} maxLength={1500} value={preferences.analysis_goals}
                    onChange={event => update('analysis_goals', event.target.value)}
                    placeholder="Relances à traiter, ventes par forfait, offres concurrentes…" />
                </label>
              </div>
            </section>

            <section className="wo-detail wo-form" aria-labelledby="wo-channels-title">
              <div>
                <p className="wo-eyebrow">COMMUNICATION</p>
                <h2 id="wo-channels-title">Canaux à raccorder</h2>
                <p className="wo-setup-description">Renseignez les comptes utilisés par votre entreprise.</p>
              </div>
              <div className="wo-form-grid">
                <label>
                  Boîte Gmail
                  <input type="email" maxLength={254} value={preferences.gmail_address}
                    onChange={event => update('gmail_address', event.target.value)} />
                </label>
                <label>
                  Boîte Outlook
                  <input type="email" maxLength={254} value={preferences.outlook_address}
                    onChange={event => update('outlook_address', event.target.value)} />
                </label>
                <label>
                  Numéro WhatsApp Business
                  <input type="tel" maxLength={60} value={preferences.whatsapp_number}
                    onChange={event => update('whatsapp_number', event.target.value)} />
                </label>
              </div>
            </section>

            <div className="wo-form-actions">
              <button type="submit" className="wo-button wo-primary">
                {status === 'saving' ? 'Enregistrement…' : 'Enregistrer la configuration'}
              </button>
            </div>
          </fieldset>
          {status === 'saved' && <p className="wo-success" role="status">Configuration enregistrée.</p>}
          {status === 'saveError' && <p className="wo-alert" role="alert">Impossible d’enregistrer. Réessayez.</p>}
        </form>
      )}

      <ClientImport onImported={onImported} />
    </div>
  )
}
