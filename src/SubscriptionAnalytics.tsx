import { useEffect, useRef, useState, type FormEvent } from 'react'
import { db } from './lib/olimline'
import {
  assessSubscription, demoClients, demoPlans, demoSubscriptions, formatPrice, recommendPlan,
  subscriptionStatuses, type Plan, type Subscription, type SubscriptionClient, type SubscriptionStatus,
} from './lib/subscriptions'
import './SubscriptionAnalytics.css'

type Portfolio =
  | { status: 'ready'; subscriptions: Subscription[] }
  | { status: 'unavailable' | 'error' }

type Filter = 'all' | SubscriptionStatus
const statuses = Object.keys(subscriptionStatuses) as SubscriptionStatus[]

function optionalNumber(value: string) {
  return value === '' ? null : Number(value)
}

function SubscriptionForm({ client, value, plans, demo, onSave, onClose }: {
  client: SubscriptionClient
  value: Subscription | undefined
  plans: Plan[]
  demo: boolean
  onSave: (subscription: Subscription) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState({
    plan: value?.plan_id ?? '',
    data: String(value?.required_data_gb ?? ''),
    calls: String(value?.required_france_minutes ?? ''),
    budget: String(value?.monthly_budget ?? ''),
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const activePlans = plans.filter(plan => plan.active)
  const record: Subscription = {
    client_id: client.id,
    plan_id: draft.plan || null,
    required_data_gb: optionalNumber(draft.data),
    required_france_minutes: optionalNumber(draft.calls),
    monthly_budget: optionalNumber(draft.budget),
  }
  const recommended = recommendPlan(activePlans, record)

  useEffect(() => {
    form.current?.focus()
    form.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await onSave(record)
      setMessage(demo ? 'L’exemple a été mis à jour.' : 'Le forfait et les besoins ont été enregistrés.')
    } catch {
      setError('Impossible d’enregistrer le forfait. Actualisez la page et réessayez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form ref={form} tabIndex={-1} className="wo-subscription-panel"
      onSubmit={save} aria-labelledby="wo-subscription-editor">
      <div className="wo-subscription-heading">
        <h2 id="wo-subscription-editor">{client.full_name}</h2>
        <button className="wo-button wo-quiet" type="button" disabled={busy} onClick={onClose}>Fermer</button>
      </div>
      <div className="wo-subscription-fields">
        <label>Internet nécessaire (Go / mois)
          <input type="number" min="0" max="2147483647" step="1" value={draft.data} disabled={busy}
            onChange={event => setDraft({ ...draft, data: event.target.value })} />
        </label>
        <label>Appels vers la France (min / mois)
          <input type="number" min="0" max="2147483647" step="1" value={draft.calls} disabled={busy}
            onChange={event => setDraft({ ...draft, calls: event.target.value })} />
        </label>
        <label>Budget maximal (₪ / mois)
          <input type="number" min="0" max="99999999.99" step="0.01" value={draft.budget} disabled={busy}
            onChange={event => setDraft({ ...draft, budget: event.target.value })} />
        </label>
        <label>Forfait attribué
          <select value={draft.plan} disabled={busy}
            onChange={event => setDraft({ ...draft, plan: event.target.value })}>
            <option value="">Sans forfait</option>
            {draft.plan && !activePlans.some(plan => plan.id === draft.plan) &&
              <option value={draft.plan} disabled>Forfait indisponible</option>}
            {activePlans.map(plan => (
              <option value={plan.id} key={plan.id}>{plan.name} · {formatPrice(plan.price)} / mois</option>
            ))}
          </select>
        </label>
      </div>
      <div className="wo-form-actions">
        {recommended && recommended.id !== draft.plan && (
          <button type="button" className="wo-button wo-quiet" disabled={busy}
            onClick={() => setDraft({ ...draft, plan: recommended.id })}>
            Choisir {recommended.name}
          </button>
        )}
        <button type="submit" className="wo-button wo-primary" disabled={busy ||
          Boolean(draft.plan && !activePlans.some(plan => plan.id === draft.plan))}>
          {busy ? 'Enregistrement…' : demo ? 'Mettre à jour l’exemple' : 'Enregistrer le forfait'}
        </button>
      </div>
      {message && <p className="wo-success" role="status">{message}</p>}
      {error && <p className="wo-alert" role="alert">{error}</p>}
    </form>
  )
}

export default function SubscriptionAnalytics({ clients, plans, organizationId, initialClientId }: {
  clients: SubscriptionClient[]
  plans: Plan[]
  organizationId: string
  initialClientId?: string
}) {
  const [mode, setMode] = useState<'portfolio' | 'demo'>('portfolio')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState(initialClientId)
  const [examples, setExamples] = useState(demoSubscriptions)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{ attempt: number; data: Portfolio }>()
  const portfolio = loaded?.attempt === attempt ? loaded.data : undefined
  const demo = mode === 'demo' || portfolio?.status === 'unavailable'

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      const { data, error } = await db().from('wo_client_subscriptions')
        .select('client_id, plan_id, required_data_gb, required_france_minutes, monthly_budget')
        .eq('organization_id', organizationId)
        .abortSignal(controller.signal)
      if (controller.signal.aborted) return
      if (error) {
        const unavailable = error.code === 'PGRST205' || error.code === '42P01'
        setLoaded({ attempt, data: { status: unavailable ? 'unavailable' : 'error' } })
      } else {
        setLoaded({ attempt, data: { status: 'ready', subscriptions: (data ?? []) as Subscription[] } })
      }
    }

    void load().catch(() => {
      if (!controller.signal.aborted) setLoaded({ attempt, data: { status: 'error' } })
    })
    return () => controller.abort()
  }, [organizationId, attempt])

  const currentPlans = demo ? demoPlans : plans
  const assignments = demo ? examples : portfolio?.status === 'ready' ? portfolio.subscriptions : []
  const byClient = new Map(assignments.map(row => [row.client_id, row]))
  const byPlan = new Map(currentPlans.map(plan => [plan.id, plan]))
  const rows = (demo ? demoClients : clients).map(client => {
    const assignment = byClient.get(client.id)
    const plan = assignment?.plan_id ? byPlan.get(assignment.plan_id) : undefined
    const assessment = assessSubscription(assignment, plan)
    const recommended = assignment && assessment.status !== 'fit' ? recommendPlan(currentPlans, assignment) : undefined
    return { client, assignment, plan, recommended, ...assessment }
  })
  const counts = { fit: 0, review: 0, incomplete: 0 }
  rows.forEach(row => { counts[row.status] += 1 })
  const selected = rows.find(row => row.client.id === selectedId)
  const visible = rows.filter(row => filter === 'all' || row.status === filter)

  function changeMode(next: 'portfolio' | 'demo') {
    setMode(next)
    setFilter('all')
    setSelectedId(undefined)
  }

  async function save(subscription: Subscription) {
    if (demo) {
      setExamples(current => current.map(row => row.client_id === subscription.client_id ? subscription : row))
      return
    }
    const { error } = await db().rpc('wo_save_client_subscription', {
      p_client_id: subscription.client_id,
      p_plan_id: subscription.plan_id,
      p_data_gb: subscription.required_data_gb,
      p_france_minutes: subscription.required_france_minutes,
      p_monthly_budget: subscription.monthly_budget,
    })
    if (error) throw error

    setLoaded(current => current?.data.status === 'ready' ? {
      ...current,
      data: {
        status: 'ready',
        subscriptions: [
          ...current.data.subscriptions.filter(row => row.client_id !== subscription.client_id),
          subscription,
        ],
      },
    } : current)
  }

  return (
    <section className="wo-subscription-page" aria-labelledby="wo-subscription-title">
      <div className="wo-subscription-heading">
        <div>
          <h1 id="wo-subscription-title">Analyse des forfaits</h1>
          <p>Comparez les forfaits attribués aux besoins renseignés dans chaque dossier.</p>
        </div>
        <div className="wo-form-actions" role="group" aria-label="Jeu de données">
          <button type="button" className="wo-button wo-quiet" aria-pressed={!demo}
            disabled={portfolio?.status === 'unavailable'} onClick={() => changeMode('portfolio')}>Portefeuille</button>
          <button type="button" className="wo-button wo-quiet" aria-pressed={demo}
            onClick={() => changeMode('demo')}>Exemple Olimline</button>
        </div>
      </div>

      {demo && <p className="wo-subscription-demo">Données de démonstration</p>}
      {portfolio?.status === 'unavailable' && (
        <p className="wo-subscription-demo">Appliquez la migration 22 dans Supabase pour activer les attributions dans le portefeuille.</p>
      )}
      {!demo && !portfolio && <p role="status">Chargement des forfaits attribués…</p>}
      {!demo && portfolio?.status === 'error' && (
        <div className="wo-alert" role="alert">
          Impossible de charger les forfaits attribués.
          <button type="button" className="wo-button wo-quiet" onClick={() => setAttempt(current => current + 1)}>Réessayer</button>
        </div>
      )}

      {(demo || portfolio?.status === 'ready') && (
        <>
          <section className="wo-subscription-panel" aria-labelledby="wo-fit-chart">
            <div className="wo-subscription-heading">
              <h2 id="wo-fit-chart">Adéquation aux besoins</h2>
              <button type="button" className="wo-button wo-quiet"
                aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tous les dossiers ({rows.length})</button>
            </div>
            <div className="wo-fit-chart" role="group" aria-label="Filtrer par résultat">
              {statuses.map(status => (
                <button type="button" className="wo-fit-metric" key={status} data-status={status}
                  aria-pressed={filter === status} onClick={() => setFilter(filter === status ? 'all' : status)}>
                  <strong>{counts[status]}</strong> <span>{subscriptionStatuses[status]}</span>
                  <span className="wo-fit-track" aria-hidden="true">
                    <span style={{ width: (rows.length ? counts[status] / rows.length * 100 : 0) + '%' }} />
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="wo-subscription-panel" aria-labelledby="wo-subscription-results">
            <div className="wo-subscription-heading">
              <h2 id="wo-subscription-results">{filter === 'all' ? 'Dossiers actifs' : subscriptionStatuses[filter]}</h2>
              <span role="status">{visible.length} dossier{visible.length !== 1 ? 's' : ''}</span>
            </div>
            {visible.length ? (
              <ul className="wo-subscription-list">
                {visible.map(row => (
                  <li key={row.client.id}>
                    <div>
                      <strong>{row.client.full_name}</strong>
                      <p>{row.plan ? row.plan.name + ' · ' + formatPrice(row.plan.price) + ' / mois'
                        : row.assignment?.plan_id ? 'Forfait indisponible' : 'Sans forfait'}</p>
                    </div>
                    <div>
                      <span className="wo-fit-status" data-status={row.status}>{subscriptionStatuses[row.status]}</span>
                      {row.reasons.map(reason => <p key={reason}>{reason}</p>)}
                      {row.recommended && <p><strong>Conseillé</strong> {row.recommended.name} · {formatPrice(row.recommended.price)}</p>}
                    </div>
                    <button type="button" className="wo-button wo-quiet"
                      aria-label={'Modifier le forfait de ' + row.client.full_name}
                      onClick={() => setSelectedId(row.client.id)}>Modifier</button>
                  </li>
                ))}
              </ul>
            ) : <p>Aucun dossier dans ce résultat.</p>}
          </section>
          {selected && (
            <SubscriptionForm key={(demo ? 'demo-' : '') + selected.client.id} client={selected.client}
              value={selected.assignment} plans={currentPlans} demo={demo} onSave={save}
              onClose={() => setSelectedId(undefined)} />
          )}
        </>
      )}
    </section>
  )
}
