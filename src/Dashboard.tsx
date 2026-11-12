import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { db } from './lib/olimline'
import type { Profile } from './lib/auth'
import { toDateTimeInput, fromDateTimeInput, formatContactDate, isOverdue } from './lib/followups'
import EmailAnalysis from './EmailAnalysis.tsx'
import './Dashboard.css'

const WorkspaceSettings = lazy(() => import('./WorkspaceSettings.tsx'))
const ClientJourneyManager = lazy(() => import('./ClientJourneyManager.tsx'))
const ClientRequestsInbox = lazy(() => import('./ClientRequestsInbox.tsx'))

type Client = {
  id: string
  organization_id: string
  full_name: string
  email: string
  phone: string
  needs: string
  coordinator_id: string | null
  created_at: string
  last_contact_at: string | null
  next_followup_at: string | null
  archived_at: string | null
}

type Plan = {
  id: string
  name: string
  price: number | string
  data_gb: number
  national_minutes: number
  international_minutes: number
  active: boolean
}

type Staff = {
  id: string
  full_name: string
  role: string
}

type Props = {
  profile: Profile
  roleLabel: string
  onLogout: () => Promise<void>
  logoutBusy: boolean
  logoutError: string
}

const fields = 'id, organization_id, full_name, email, phone, needs, coordinator_id, created_at, last_contact_at, next_followup_at, archived_at'
const tabLabels = { clients: 'Relation client', requests: 'Demandes clients', plans: 'Catalogue', settings: 'Configuration' }

function messageOf(error: unknown) {
  return error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : 'Une erreur est survenue. Réessayez.'
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2)
    .map(word => word[0]).join('').toUpperCase()
}

function exportCsv(rows: Client[]) {
  const cell = (value: string) => {
    const safe = /^[\s]*[=+\-@]/.test(value) ? "'" + value : value
    return '"' + safe.replace(/"/g, '""') + '"'
  }

  const lines = [
    ['Nom', 'Email', 'Téléphone', 'Besoins', 'Dernier contact', 'Prochaine relance'],
    ...rows.map(client => [
      client.full_name, client.email, client.phone, client.needs,
      client.last_contact_at ? formatContactDate(client.last_contact_at) : '',
      client.next_followup_at ? formatContactDate(client.next_followup_at) : '',
    ]),
  ]

  const blob = new Blob([
    '\uFEFF' + lines.map(row => row.map(cell).join(';')).join('\r\n'),
  ], { type: 'text/csv;charset=utf-8' })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'olimline-clients.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function CreateClientDialog({ onCreated, onClose }: {
  onCreated: (client: Client) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const form = new FormData(event.currentTarget)
    const fullName = String(form.get('full_name') ?? '').trim()
    if (!fullName) {
      setError('Le nom est obligatoire.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const { data, error: problem } = await db().rpc('wo_create_client', {
        p_full_name: fullName,
        p_email: String(form.get('email') ?? '').trim(),
        p_phone: String(form.get('phone') ?? ''),
        p_needs: String(form.get('needs') ?? ''),
      }).select(fields).single()

      if (problem?.code === '23505') {
        setError('Une fiche utilise déjà cette adresse e-mail dans l’entreprise.')
      } else if (problem) {
        throw problem
      } else {
        onCreated(data as Client)
      }
    } catch (problem) {
      setError(messageOf(problem))
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} className="wo-detail wo-create-client" aria-labelledby="wo-create-title"
      onCancel={event => {
        event.preventDefault()
        if (!busy) onClose()
      }}>
      <h2 id="wo-create-title">Nouvelle fiche client</h2>
      <form className="wo-form" onSubmit={create} aria-busy={busy}>
        <fieldset disabled={busy} className="wo-form wo-create-fields">
          <label>Nom complet
            <input name="full_name" required maxLength={160} autoFocus />
          </label>
          <label>Adresse e-mail
            <input name="email" type="email" required maxLength={254} />
          </label>
          <label>Téléphone
            <input name="phone" type="tel" maxLength={60} />
          </label>
          <label>Besoins et notes de suivi
            <textarea name="needs" rows={3} maxLength={6000} />
          </label>
        </fieldset>
        {error && <p className="wo-alert" role="alert">{error}</p>}
        <div className="wo-form-actions">
          <button type="submit" className="wo-button wo-primary" disabled={busy}>
            {busy ? 'Création…' : 'Créer la fiche'}
          </button>
          <button type="button" className="wo-button wo-quiet" disabled={busy} onClick={onClose}>
            Annuler
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default function Dashboard({
  profile, roleLabel, onLogout, logoutBusy, logoutError,
}: Props) {
  const admin = profile.role === 'admin'
  const editable = profile.role !== 'client'

  const [tab, setTab] = useState<keyof typeof tabLabels>('clients')
  const configuring = tab === 'settings'
  const viewingRequests = tab === 'requests'
  const showPortfolio = !configuring && !viewingRequests
  const [clients, setClients] = useState<Client[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [selected, setSelected] = useState<Client | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const [now, setNow] = useState(() => Date.now())

  const original = clients.find(client => client.id === selected?.id)
  const dirty = Boolean(selected && original && (
    selected.full_name !== original.full_name ||
    selected.phone !== original.phone ||
    selected.needs !== original.needs ||
    selected.coordinator_id !== original.coordinator_id ||
    selected.last_contact_at !== original.last_contact_at ||
    selected.next_followup_at !== original.next_followup_at
  ))

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setLoadError('')

      try {
        let query = db().from('wo_clients').select(fields)
          .eq('organization_id', profile.organization_id)

        if (profile.role === 'coordinator') {
          query = query.eq('coordinator_id', profile.id)
        }

        if (profile.role === 'client') {
          query = query.eq('user_id', profile.id)
        }

        const [clientResult, planResult, staffResult] = await Promise.all([
          query.order('full_name').abortSignal(controller.signal),

          db().from('wo_plans')
            .select('id, name, price, data_gb, national_minutes, international_minutes, active')
            .eq('organization_id', profile.organization_id)
            .order('price')
            .abortSignal(controller.signal),

          profile.role === 'admin'
            ? db().from('wo_profiles')
              .select('id, full_name, role')
              .eq('organization_id', profile.organization_id)
              .in('role', ['coordinator', 'admin'])
              .order('full_name')
              .abortSignal(controller.signal)
            : Promise.resolve({ data: [], error: null }),
        ])

        if (!active) return
        if (clientResult.error) throw clientResult.error
        if (planResult.error) throw planResult.error
        if (staffResult.error) throw staffResult.error

        const rows = (clientResult.data ?? []) as Client[]
        setClients(rows)
        setPlans((planResult.data ?? []) as Plan[])
        setStaff((staffResult.data ?? []) as Staff[])
        const first = profile.role === 'client' ? rows[0] : rows.find(row => !row.archived_at)
        setSelected(first ? { ...first } : null)
        setSaved(false)
        setSaveError('')
      } catch (error) {
        if (active) setLoadError(messageOf(error))
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [profile.id, profile.organization_id, profile.role, revision])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  useEffect(() => {
    if (!dirty) return

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function mayLeave() {
    return !saving && (
      !dirty ||
      window.confirm('Abandonner les modifications non enregistrées ?')
    )
  }

  function choose(client: Client) {
    if (selected?.id === client.id || !mayLeave()) return
    setSelected({ ...client })
    setSaved(false)
    setSaveError('')
  }

  function openCreation() {
    if (!mayLeave()) return
    if (dirty && original) setSelected({ ...original })
    setNotice('')
    setCreating(true)
  }

  function storeClient(row: Client) {
    setClients(current => [...current.filter(client => client.id !== row.id), row]
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr')))
  }

  async function openRequestClient(clientId: string) {
    if (!mayLeave()) return
    const { data, error } = await db().from('wo_clients').select(fields)
      .eq('id', clientId).eq('organization_id', profile.organization_id).maybeSingle()
    if (error || !data) throw new Error('Ce dossier n’est plus accessible.')

    const client = data as Client
    storeClient(client)
    setSelected(client)
    setSearch('')
    setFilter(client.archived_at ? 'archived' : 'all')
    setSaved(false)
    setSaveError('')
    setNotice('')
    setTab('clients')
  }

  function onCreated(client: Client) {
    storeClient(client)
    setCreating(false)
    setSearch('')
    setFilter('all')
    setSelected(client)
    setSaved(false)
    setSaveError('')
    setNotice('Fiche client créée.')
  }

  function changeFilter(value: string) {
    if ((value === 'archived') !== (filter === 'archived')) {
      if (!mayLeave()) return
      setSelected(null)
      setSearch('')
      setSaved(false)
      setSaveError('')
    }
    setFilter(value)
  }

  async function changeArchive() {
    if (!editable || !selected || !mayLeave()) return
    const archived = !selected.archived_at
    setSaving(true)
    setSaved(false)
    setSaveError('')
    setNotice('')
    try {
      const { data, error } = await db().rpc('wo_set_client_archive', {
        p_client_id: selected.id,
        p_archived: archived,
      }).select(fields).single()

      if (error) throw error

      const updated = data as Client
      storeClient(updated)
      setSelected(archived ? null : updated)
      if (!archived) {
        setFilter('all')
        setSearch('')
      }
      setNotice(archived
        ? 'Fiche archivée. Retrouvez-la dans « Fiches archivées ».'
        : 'Fiche restaurée dans le portefeuille actif.')
    } catch (error) {
      setSaveError(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  function openSettings() {
    if (configuring || !mayLeave()) return
    if (dirty && original) setSelected({ ...original })
    setTab('settings')
    window.scrollTo(0, 0)
  }

  function change<
    K extends 'full_name' | 'phone' | 'needs' | 'coordinator_id' | 'last_contact_at' | 'next_followup_at'
  >(field: K, value: Client[K]) {
    setSelected(current => current ? { ...current, [field]: value } : null)
    setSaved(false)
    setSaveError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !original || !editable || saving || !dirty) return

    const row = {
      ...selected,
      full_name: selected.full_name.trim(),
      phone: selected.phone.trim(),
      needs: selected.needs.trim(),
    }

    if (!row.full_name) {
      setSaveError('Le nom est obligatoire.')
      return
    }

    setSaving(true)
    setSaved(false)
    setSaveError('')

    try {
      // Les coordonnées peuvent aussi être mises à jour dans l’espace client.
      const patch: Partial<Client> = {}
      if (selected.full_name !== original.full_name) patch.full_name = row.full_name
      if (selected.phone !== original.phone) patch.phone = row.phone
      if (selected.needs !== original.needs) patch.needs = row.needs
      if (row.last_contact_at !== original.last_contact_at) patch.last_contact_at = row.last_contact_at
      if (row.next_followup_at !== original.next_followup_at) patch.next_followup_at = row.next_followup_at
      if (admin && row.coordinator_id !== original.coordinator_id) patch.coordinator_id = row.coordinator_id

      const { data, error } = await db().from('wo_clients')
        .update(patch)
        .eq('id', row.id)
        .eq('organization_id', profile.organization_id)
        .select(fields)
        .single()

      if (error) throw error

      const updated = data as Client

      storeClient(updated)
      setSelected(updated)
      setSaved(true)
    } catch (error) {
      setSaveError(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  const archivedView = filter === 'archived'
  const activeClients = clients.filter(client => !client.archived_at)
  const listedClients = archivedView ? clients.filter(client => client.archived_at) : activeClients
  const visible = listedClients.filter(client => {
    const match = normalize([
      client.full_name, client.email, client.phone, client.needs,
    ].join(' ')).includes(normalize(search))

    return match && (
      filter === 'all' || archivedView ||
      (filter === 'needs' && !client.needs.trim()) ||
      (filter === 'overdue' && isOverdue(client, now)) ||
      (filter === 'phone' && !client.phone.trim()) ||
      (filter === 'unassigned' && !client.coordinator_id)
    )
  })

  const overdueCount = activeClients.filter(client => isOverdue(client, now)).length
  const ready = !loading && !loadError
  const metrics = [
    editable ? ['Clients actifs', activeClients.length] : ['Mon dossier', clients.length],
    ['Relances en retard', overdueCount],
    [
      admin ? 'Clients à attribuer' : 'Téléphones renseignés',
      activeClients.filter(client =>
        admin ? !client.coordinator_id : client.phone.trim()
      ).length,
    ],
    ['Forfaits actifs', plans.filter(plan => plan.active).length],
  ]

  const owner = selected?.coordinator_id
    ? staff.find(person => person.id === selected.coordinator_id)?.full_name
      ?? (profile.role === 'coordinator' ? 'Vous' : 'Équipe Olimline')
    : 'À attribuer'

  return (
    <div className="wo-workspace" data-role={profile.role}>
      <a
        className="wo-skip"
        href="#/olimline/espace"
        onClick={event => {
          event.preventDefault()
          const target = document.getElementById('wo-content')
          target?.focus()
          target?.scrollIntoView({ block: 'start' })
        }}
      >
        Aller au contenu
      </a>

      <aside className="wo-sidebar">
        <a className="wo-brand" href="#top">watchover<span>.</span></a>

        <div className="wo-company">
          <span className="wo-company-icon">O</span>
          <div>
            <strong>Olimline</strong>
            <small>Téléphonie · Espace de travail</small>
          </div>
        </div>

        <p className="wo-nav-label">VOTRE ESPACE</p>

        <nav aria-label="Navigation de votre espace">
          <button
            type="button"
            className={tab === 'clients' ? 'active' : ''}
            aria-current={tab === 'clients' ? 'page' : undefined}
            onClick={() => setTab('clients')}
          >
            <span aria-hidden="true">◈</span>
            {editable ? 'Portefeuille clients' : 'Mon dossier'}
          </button>

          {editable && (
            <button type="button" className={viewingRequests ? 'active' : ''}
              aria-current={viewingRequests ? 'page' : undefined} onClick={() => setTab('requests')}>
              <span aria-hidden="true">▣</span>
              Demandes clients
            </button>
          )}

          <button
            type="button"
            className={tab === 'plans' ? 'active' : ''}
            aria-current={tab === 'plans' ? 'page' : undefined}
            onClick={() => setTab('plans')}
          >
            <span aria-hidden="true">▤</span>
            Catalogue des forfaits
          </button>

          {admin && (
            <button type="button" className={configuring ? 'active' : ''}
              aria-current={configuring ? 'page' : undefined} onClick={openSettings}>
              <span aria-hidden="true">⚙</span>
              Configuration
            </button>
          )}
        </nav>

        <div className="wo-sidebar-bottom">
          <span className="wo-role">{roleLabel}</span>
          <p>Les liens qui comptent.</p>
          <a href="#/olimline">Voir le site Olimline ↗</a>
        </div>
      </aside>

      <div className="wo-main">
        <header className="wo-topbar">
          <span>
            Olimline <span aria-hidden="true">/</span>
            {tabLabels[tab]}
          </span>

          <div className="wo-user">
            <span className="wo-avatar">{initials(profile.full_name)}</span>
            <div>
              <strong>{profile.full_name}</strong>
              <small>{roleLabel}</small>
            </div>
            {admin && (
              <a className="wo-button wo-quiet" href="#/watchover/equipe/invitations"
                onClick={event => { if (!mayLeave()) event.preventDefault() }}>
                Accès de l’équipe
              </a>
            )}
            <button
              type="button"
              className="wo-button wo-quiet"
              disabled={logoutBusy || saving}
              onClick={() => { if (mayLeave()) void onLogout() }}
            >
              {logoutBusy ? 'Déconnexion…' : 'Se déconnecter'}
            </button>
          </div>
        </header>

        <main id="wo-content" className="wo-content" tabIndex={-1}>
          {logoutError && (
            <p className="wo-alert" role="alert">{logoutError}</p>
          )}

          {admin && configuring && (
            <Suspense fallback={<p role="status">Ouverture de la configuration…</p>}>
              <WorkspaceSettings key={profile.organization_id}
                organizationId={profile.organization_id}
                onImported={() => setRevision(value => value + 1)} />
            </Suspense>
          )}

          {editable && viewingRequests && (
            <Suspense fallback={<p role="status">Ouverture des demandes…</p>}>
              <ClientRequestsInbox onOpenClient={openRequestClient} />
            </Suspense>
          )}

          <section className="wo-welcome" hidden={!showPortfolio}>
            <div>
              <p className="wo-eyebrow">VOTRE ENTREPRISE. VOTRE MANIÈRE.</p>
              <h1>
                {tab === 'plans'
                  ? 'Le bon forfait commence ici.'
                  : editable
                    ? 'Chaque client compte.'
                    : 'Bienvenue dans votre espace.'}
              </h1>
              <p>
                {editable
                  ? 'Retrouvez les informations utiles et préparez votre prochain échange.'
                  : 'Retrouvez les informations de votre dossier et les offres Olimline.'}
              </p>
            </div>
            <span className="wo-welcome-mark" aria-hidden="true">O.</span>
          </section>

          <div className="wo-metrics" hidden={!showPortfolio}>
            {metrics.map(([label, value]) => (
              <article key={String(label)}>
                <span>{label}</span>
                <strong>{ready ? value : '—'}</strong>
              </article>
            ))}
          </div>

          <div className="wo-section-heading" hidden={!showPortfolio}>
            <div>
              <p className="wo-eyebrow">
                {tab === 'clients' ? 'RELATION CLIENT' : 'OFFRES OLIMLINE'}
              </p>
              <h2>
                {tab === 'plans'
                  ? 'Catalogue des forfaits'
                  : editable ? 'Votre portefeuille' : 'Mon dossier'}
              </h2>
            </div>
            <div className="wo-form-actions">
              {editable && ready && tab === 'clients' && (
                <button className="wo-button wo-primary" type="button"
                  disabled={saving} onClick={openCreation}>
                  Nouvelle fiche
                </button>
              )}
              <button
                className="wo-button wo-quiet"
                type="button"
                disabled={loading || saving}
                onClick={() => {
                  if (mayLeave()) {
                    setSelected(null)
                    setNotice('')
                    setRevision(value => value + 1)
                  }
                }}
              >
                Actualiser
              </button>
            </div>
          </div>

          {showPortfolio && loading && (
            <div className="wo-empty" role="status">
              Chargement de votre espace…
            </div>
          )}

          {showPortfolio && loadError && (
            <p className="wo-alert" role="alert">
              Impossible de charger les données : {loadError}.
              Utilisez « Actualiser » pour réessayer.
            </p>
          )}

          {ready && tab === 'plans' && (
            <div className="wo-plan-grid">
              {plans.length ? plans.map(plan => (
                <article className="wo-plan" key={plan.id}>
                  <span className="wo-badge">
                    {plan.active ? 'Disponible' : 'Inactif'}
                  </span>
                  <h3>{plan.name}</h3>
                  <p className="wo-price">
                    {Number(plan.price).toLocaleString('fr-FR')} ₪
                    <small> / mois</small>
                  </p>
                  <ul>
                    <li><strong>{plan.data_gb} Go</strong> d’internet</li>
                    <li>
                      <strong>
                        {plan.national_minutes.toLocaleString('fr-FR')} min
                      </strong> en Israël
                    </li>
                    <li>
                      <strong>{plan.international_minutes} min</strong> vers la France
                    </li>
                  </ul>
                </article>
              )) : <p className="wo-empty">Aucun forfait disponible.</p>}
            </div>
          )}

          {ready && tab === 'clients' && <>
            {creating && <CreateClientDialog onCreated={onCreated} onClose={() => setCreating(false)} />}
            {notice && <p ref={noticeRef} className="wo-success" role="status" tabIndex={-1}>{notice}</p>}
            {editable && !archivedView && overdueCount > 0 && (
              <div className="wo-alert wo-followup-alert" role="status">
                <strong>{overdueCount} relance{overdueCount > 1 ? 's' : ''} en retard.</strong>
                <button type="button" className="wo-button wo-quiet"
                  onClick={() => { setFilter('overdue'); setSearch('') }}>
                  Voir les clients à relancer
                </button>
              </div>
            )}
            {editable && (
              <div className="wo-toolbar">
                <label className="wo-search">
                  Rechercher un client
                  <input
                    type="search"
                    placeholder="Nom, email, téléphone, besoin…"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                </label>
                <label>
                  Afficher
                  <select
                    value={filter}
                    onChange={event => changeFilter(event.target.value)}
                  >
                    <option value="all">Clients actifs</option>
                    <option value="overdue">Relances en retard</option>
                    <option value="needs">Besoins à préciser</option>
                    <option value="phone">Téléphone manquant</option>
                    {admin && <option value="unassigned">Sans responsable</option>}
                    <option value="archived">Fiches archivées</option>
                  </select>
                </label>
                <button
                  className="wo-button wo-quiet"
                  type="button"
                  disabled={!visible.length}
                  onClick={() => exportCsv(visible)}
                >
                  Exporter CSV ↓
                </button>
              </div>
            )}

            <div className={
              editable ? 'wo-client-layout' : 'wo-client-layout wo-client-only'
            }>
              {editable && (
                <section className="wo-client-list" aria-label="Liste des clients">
                  <div className="wo-list-heading">
                    <strong>{archivedView ? 'Fiches archivées' : 'Clients actifs'}</strong>
                    <span aria-live="polite">
                      {visible.length} résultat{visible.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {visible.length ? visible.map(client => (
                    <button
                      type="button"
                      className={'wo-client-row' + (
                        selected?.id === client.id ? ' selected' : ''
                      )}
                      aria-pressed={selected?.id === client.id}
                      key={client.id}
                      onClick={() => choose(client)}
                      disabled={saving}
                    >
                      <span className="wo-avatar">{initials(client.full_name)}</span>
                      <span>
                        <strong>{client.full_name}</strong>
                        <small>{client.email}</small>
                        <span className="wo-row-note">
                          {client.needs || 'Besoins à préciser'}
                        </span>
                        {client.archived_at ? (
                          <span className="wo-followup">Archivée le {formatContactDate(client.archived_at)}</span>
                        ) : (
                          <span className="wo-followup" data-overdue={isOverdue(client, now)}>
                            {client.next_followup_at
                              ? (isOverdue(client, now) ? 'En retard · ' : 'Relance · ') +
                                formatContactDate(client.next_followup_at)
                              : 'Relance à planifier'}
                          </span>
                        )}
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  )) : (
                    <p className="wo-empty">
                      {listedClients.length
                        ? 'Aucun résultat pour cette recherche.'
                        : archivedView
                          ? 'Aucune fiche archivée.'
                        : admin
                          ? 'Aucun client actif dans votre portefeuille.'
                          : 'Aucun client actif attribué.'}
                    </p>
                  )}
                </section>
              )}

              {selected && (!editable || Boolean(selected.archived_at) === archivedView) ? (
                <section className="wo-detail" aria-labelledby="wo-client-title">
                  <div className="wo-detail-top">
                    <span className="wo-avatar wo-avatar-large">
                      {initials(selected.full_name)}
                    </span>
                    <div>
                      <span className="wo-badge">
                        {editable && selected.archived_at ? 'Fiche archivée' : 'Fiche client'}
                      </span>
                      <h2 id="wo-client-title">{selected.full_name}</h2>
                      <a href={'mailto:' + encodeURIComponent(selected.email)}>
                        {selected.email}
                      </a>
                    </div>
                  </div>

                  <div className="wo-detail-meta">
                    <span>
                      Créé le {new Date(selected.created_at).toLocaleDateString('fr-FR')}
                    </span>
                    <span>Responsable : {owner}</span>
                  </div>

                  <form className="wo-form" onSubmit={save} aria-busy={saving}>
                    <div className="wo-form-grid">
                      <label>
                        Nom complet
                        <input
                          required
                          maxLength={160}
                          readOnly={!editable}
                          disabled={saving}
                          value={selected.full_name}
                          onChange={event => change('full_name', event.target.value)}
                          autoComplete="off"
                        />
                      </label>

                      <label>
                        Téléphone
                        <input
                          type="tel"
                          maxLength={60}
                          readOnly={!editable}
                          disabled={saving}
                          value={selected.phone}
                          onChange={event => change('phone', event.target.value)}
                          autoComplete="off"
                          placeholder="Non renseigné"
                        />
                      </label>
                    </div>

                    <div className="wo-followup-fields">
                      <div className="wo-form-grid">
                        <label>
                          Dernier contact
                          <input type="datetime-local"
                            value={toDateTimeInput(selected.last_contact_at)}
                            readOnly={!editable} disabled={saving}
                            onChange={event => change(
                              'last_contact_at', fromDateTimeInput(event.target.value)
                            )}
                          />
                        </label>
                        <label>
                          Prochaine relance
                          <input type="datetime-local"
                            value={toDateTimeInput(selected.next_followup_at)}
                            readOnly={!editable} disabled={saving}
                            onChange={event => change(
                              'next_followup_at', fromDateTimeInput(event.target.value)
                            )}
                          />
                        </label>
                      </div>
                      <small>Heure locale : {Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
                      {editable && (
                        <button type="button" className="wo-button wo-quiet"
                          disabled={saving}
                          onClick={() => change('last_contact_at', new Date().toISOString())}>
                          Contact effectué maintenant
                        </button>
                      )}
                    </div>

                    <label>
                      Besoins et notes de suivi
                      <textarea
                        rows={6}
                        maxLength={6000}
                        readOnly={!editable}
                        disabled={saving}
                        value={selected.needs}
                        onChange={event => change('needs', event.target.value)}
                        placeholder="Usages, questions et points à aborder lors du prochain échange…"
                      />
                    </label>

                    {admin && (
                      <label>
                        Attribuer le dossier
                        <select
                          disabled={saving}
                          value={selected.coordinator_id ?? ''}
                          onChange={event => change(
                            'coordinator_id', event.target.value || null
                          )}
                        >
                          <option value="">Sans responsable</option>
                          {staff.map(person => (
                            <option key={person.id} value={person.id}>
                              {person.full_name} · {
                                person.role === 'admin'
                                  ? 'Administration' : 'Coordinateur'
                              }
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {saveError && (
                      <p className="wo-alert" role="alert">{saveError}</p>
                    )}

                    {saved && (
                      <p className="wo-success" role="status">
                        Modifications enregistrées.
                      </p>
                    )}

                    <div className="wo-form-actions">
                      {editable && (
                        <button
                          className="wo-button wo-primary"
                          type="submit"
                          disabled={saving || !dirty}
                        >
                          {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
                        </button>
                      )}

                      <a
                        className="wo-button wo-quiet"
                        href={'mailto:' + (
                          editable
                            ? encodeURIComponent(selected.email)
                            : 'naomiebocobza@naobocolab.com'
                        )}
                      >
                        {editable ? 'Préparer un email ↗' : 'Contacter Olimline ↗'}
                      </a>

                      {editable && (
                        <button type="button" className="wo-button wo-quiet" disabled={saving}
                          onClick={() => void changeArchive()}>
                          {selected.archived_at ? 'Restaurer la fiche' : 'Archiver la fiche'}
                        </button>
                      )}

                      {dirty && <small>Modifications non enregistrées</small>}
                    </div>
                  </form>
                  {editable && (
                    <Suspense fallback={<p role="status">Ouverture du suivi produit…</p>}>
                      <ClientJourneyManager key={selected.id + (selected.archived_at ?? '')}
                        clientId={selected.id} archived={Boolean(selected.archived_at)} />
                    </Suspense>
                  )}
                  {editable && (
                    <EmailAnalysis key={selected.id} clientId={selected.id}
                      clientEmail={selected.email} disabled={saving} />
                  )}
                </section>
              ) : (
                <section className="wo-detail wo-empty">
                  {editable
                    ? 'Sélectionnez un client pour consulter sa fiche.'
                    : 'Votre dossier n’est pas encore disponible. Contactez Olimline.'}
                </section>
              )}
            </div>
          </>}

          <footer className="wo-footer">
            Olimline · Espace de travail propulsé par Watchover
          </footer>
        </main>
      </div>
    </div>
  )
}
