import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import CrmQuestionnaireSteps from './CrmQuestionnaireSteps.tsx'
import { initialAnswers, stepError, steps, type QuestionnaireAnswers } from './lib/crmQuestionnaire'
import { db } from './lib/olimline'
import { staffLoginPaths } from './lib/staffAccess'
import './CrmQuestionnaire.css'

type Draft = {
  answers: QuestionnaireAnswers
  step: number
  revision: number | null
  ready: boolean
  dirty: boolean
}

type SavedQuestionnaire = QuestionnaireAnswers & { checkpoint: number; revision: number; ready: boolean }
const savedFields = [...Object.keys(initialAnswers), 'checkpoint', 'revision', 'ready'].join(', ')
const lastStep = steps.length - 1

export default function CrmQuestionnaire({ organizationId }: { organizationId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const currentStep = draft?.step
  const dirty = draft?.dirty ?? false

  useEffect(() => {
    const request = new AbortController()

    async function load() {
      try {
        const { data, error: readError } = await db().from('wo_crm_questionnaires')
          .select(savedFields).eq('organization_id', organizationId)
          .abortSignal(request.signal).maybeSingle()
        if (request.signal.aborted) return
        if (readError) throw readError

        if (data) {
          const { checkpoint, revision, ready, ...answers } = data as unknown as SavedQuestionnaire
          setDraft({ answers, step: checkpoint, revision, ready, dirty: false })
        } else {
          setDraft({ answers: initialAnswers, step: 0, revision: null, ready: false, dirty: false })
        }
      } catch {
        if (!request.signal.aborted) setLoadError(true)
      }
    }

    void load()
    return () => request.abort()
  }, [organizationId, loadAttempt])

  useEffect(() => { heading.current?.focus() }, [currentStep])

  useEffect(() => {
    if (!dirty && !saving) return
    function warn(event: BeforeUnloadEvent) { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, saving])

  function update<K extends keyof QuestionnaireAnswers>(key: K, value: QuestionnaireAnswers[K]) {
    setDraft(current => current && { ...current, answers: { ...current.answers, [key]: value }, dirty: true, ready: false })
    setNotice('')
    setError('')
  }

  function reload() {
    setDraft(null)
    setLoadError(false)
    setConflict(false)
    setNotice('')
    setError('')
    setLoadAttempt(value => value + 1)
  }

  async function persist(nextStep: number, ready: boolean) {
    if (!draft || saving || conflict) return
    const { team_size: teamSize, audience_size: audienceSize } = draft.answers
    const validCount = (count: number | null, limit: number) => count === null || (Number.isInteger(count) && count >= 0 && count <= limit)
    if (!validCount(teamSize, 10000) || !validCount(audienceSize, 100000000)) {
      setError('Vérifiez les nombres renseignés dans Identité et Équipe.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const revision = (draft.revision ?? 0) + 1
      const values = { ...draft.answers, checkpoint: nextStep, ready, revision }
      const table = db().from('wo_crm_questionnaires')
      const write = draft.revision === null
        ? table.insert({ ...values, organization_id: organizationId })
        : table.update(values).eq('organization_id', organizationId).eq('revision', draft.revision)
      const { data, error: writeError } = await write.select('revision').maybeSingle()

      if (writeError?.code === '23505' || (!writeError && !data)) {
        setConflict(true)
        setError('Une version plus récente a été enregistrée. Rechargez le brouillon pour la reprendre.')
        return
      }
      if (writeError) throw writeError

      setDraft({ ...draft, step: nextStep, revision, ready, dirty: false })
      setNotice(ready ? 'Questionnaire enregistré et prêt pour la proposition de CRM.' : 'Brouillon enregistré.')
    } catch {
      setError('Impossible d’enregistrer le questionnaire. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  function continueQuestionnaire(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || saving || conflict) return

    const isReview = draft.step === lastStep
    const invalidStep = isReview ? steps.findIndex((_, index) => stepError(index, draft.answers)) : draft.step
    const validation = stepError(invalidStep, draft.answers)
    if (validation) {
      setDraft({ ...draft, step: invalidStep })
      setError(validation)
      setNotice('')
      return
    }

    void persist(isReview ? lastStep : draft.step + 1, isReview)
  }

  function goBack() {
    setDraft(current => current && { ...current, step: current.step - 1 })
    setError('')
    setNotice('')
  }

  function confirmExit(event: MouseEvent<HTMLAnchorElement>) {
    if (saving || (dirty && !window.confirm('Quitter avec des réponses non enregistrées ?'))) event.preventDefault()
  }

  return (
    <div className="wo-workspace wo-quiz-page" data-role="admin">
      <main className="wo-quiz-main">
        <a className="wo-quiz-back" href={staffLoginPaths.admin} onClick={confirmExit}>← Retour à l’espace administrateur</a>
        <section className="wo-welcome">
          <div>
            <p className="wo-eyebrow">WATCHOVER · CONFIGURATION DU CRM</p>
            <h1>Un CRM adapté à votre activité</h1>
            <p>Chaque étape est enregistrée quand vous continuez. Vous pouvez reprendre le questionnaire depuis Configuration.</p>
          </div>
          <span className="wo-welcome-mark" aria-hidden="true">W.</span>
        </section>

        {!draft && !loadError && <p role="status">Chargement du questionnaire…</p>}
        {loadError && <div>
          <p className="wo-alert" role="alert">Impossible de charger le questionnaire.</p>
          <button type="button" className="wo-button wo-quiet" onClick={reload}>Réessayer</button>
        </div>}

        {draft && (
          <>
            <div className="wo-quiz-progress">
              <div className="wo-quiz-progress-title">
                <strong>Étape {draft.step + 1} sur {steps.length}</strong>
                <span className="wo-badge">{draft.ready ? 'Réponses validées' : 'Brouillon'}</span>
              </div>
              <progress aria-label="Progression du questionnaire" max={steps.length} value={draft.step + 1} />
              <ol>
                {steps.map(([label], index) => (
                  <li key={label} aria-current={index === draft.step ? 'step' : undefined}>{label}</li>
                ))}
              </ol>
            </div>

            <form className="wo-detail wo-form wo-quiz-form" onSubmit={continueQuestionnaire} aria-busy={saving}>
              <h2 ref={heading} tabIndex={-1} lang={draft.step === 2 ? 'en' : undefined}>{steps[draft.step][1]}</h2>
              <fieldset className="wo-quiz-fields" disabled={saving || conflict}>
                <CrmQuestionnaireSteps step={draft.step} answers={draft.answers} update={update} />
                <div className="wo-form-actions">
                  {draft.step > 0 && <button type="button" className="wo-button wo-quiet" onClick={goBack}>Précédent</button>}
                  <button type="button" className="wo-button wo-quiet" disabled={draft.ready}
                    onClick={() => void persist(draft.step, false)}>
                    Enregistrer le brouillon
                  </button>
                  <button type="submit" className="wo-button wo-primary" disabled={draft.ready && draft.step === lastStep}>
                    {saving ? 'Enregistrement…' : draft.step === lastStep ? 'Valider mes réponses' : 'Enregistrer et continuer'}
                  </button>
                </div>
              </fieldset>
              {error && <p className="wo-alert" role="alert">{error}</p>}
              {conflict && <button type="button" className="wo-button wo-quiet wo-quiz-inline" onClick={reload}>Recharger les réponses enregistrées</button>}
              {notice && <p className="wo-success" role="status">{notice}</p>}
            </form>
          </>
        )}
      </main>
    </div>
  )
}
