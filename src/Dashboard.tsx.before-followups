import { useEffect, useState, type FormEvent } from 'react'
import { db } from './lib/olimline'
import type { Profile } from './lib/auth'
import './Dashboard.css'

type Client = {
  id: string
  organization_id: string
  full_name: string
  email: string
  phone: string
  needs: string
  coordinator_id: string | null
  created_at: string
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

const fields = 'id, organization_id, full_name, email, phone, needs, coordinator_id, created_at'

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
    ['Nom', 'Email', 'Téléphone', 'Besoins'],
    ...rows.map(client => [
      client.full_name, client.email, client.phone, client.needs,
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

export default function Dashboard({
  profile, roleLabel, onLogout, logoutBusy, logoutError,
}: Props) {
  const admin = profile.role === 'admin'
  const editable = profile.role !== 'client'

  const [tab, setTab] = useState<'clients' | 'plans'>('clients')
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

  const original = clients.find(client => client.id === selected?.id)
  const dirty = Boolean(selected && original && (
    selected.full_name !== original.full_name ||
    selected.phone !== original.phone ||
    selected.needs !== original.needs ||
    selected.coordinator_id !== original.coordinator_id
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
        setSelected(rows[0] ? { ...rows[0] } : null)
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

  function change<
    K extends 'full_name' | 'phone' | 'needs' | 'coordinator_id'
  >(field: K, value: Client[K]) {
    setSelected(current => current ? { ...current, [field]: value } : null)
    setSaved(false)
    setSaveError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !editable || saving || !dirty) return

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
      const patch = {
        full_name: row.full_name,
        phone: row.phone,
        needs: row.needs,
        ...(admin ? { coordinator_id: row.coordinator_id } : {}),
      }

      const { data, error } = await db().from('wo_clients')
        .update(patch)
        .eq('id', row.id)
        .eq('organization_id', profile.organization_id)
        .select(fields)
        .single()

      if (error) throw error

      const updated = data as Client

      setClients(current => current
        .map(client => client.id === updated.id ? updated : client)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr')))

      setSelected(updated)
      setSaved(true)
    } catch (error) {
      setSaveError(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  const visible = clients.filter(client => {
    const match = normalize([
      client.full_name, client.email, client.phone, client.needs,
    ].join(' ')).includes(normalize(search))

    return match && (
      filter === 'all' ||
      (filter === 'needs' && !client.needs.trim()) ||
      (filter === 'phone' && !client.phone.trim()) ||
      (filter === 'unassigned' && !client.coordinator_id)
    )
  })

  const ready = !loading && !loadError
  const metrics = [
    [editable ? 'Clients accessibles' : 'Mon dossier', clients.length],
    ['Besoins renseignés', clients.filter(client => client.needs.trim()).length],
    [
      admin ? 'Clients à attribuer' : 'Téléphones renseignés',
      clients.filter(client =>
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

          <button
            type="button"
            className={tab === 'plans' ? 'active' : ''}
            aria-current={tab === 'plans' ? 'page' : undefined}
            onClick={() => setTab('plans')}
          >
            <span aria-hidden="true">▤</span>
            Catalogue des forfaits
          </button>
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
            {tab === 'clients' ? 'Relation client' : 'Catalogue'}
          </span>

          <div className="wo-user">
            <span className="wo-avatar">{initials(profile.full_name)}</span>
            <div>
              <strong>{profile.full_name}</strong>
              <small>{roleLabel}</small>
            </div>
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

          <section className="wo-welcome">
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

          <div className="wo-metrics">
            {metrics.map(([label, value]) => (
              <article key={String(label)}>
                <span>{label}</span>
                <strong>{ready ? value : '—'}</strong>
              </article>
            ))}
          </div>

          <div className="wo-section-heading">
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
            <button
              className="wo-button wo-quiet"
              type="button"
              disabled={loading || saving}
              onClick={() => {
                if (mayLeave()) {
                  setSelected(null)
                  setRevision(value => value + 1)
                }
              }}
            >
              Actualiser
            </button>
          </div>

          {loading && (
            <div className="wo-empty" role="status">
              Chargement de votre espace…
            </div>
          )}

          {loadError && (
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
                    onChange={event => setFilter(event.target.value)}
                  >
                    <option value="all">Tous les clients</option>
                    <option value="needs">Besoins à préciser</option>
                    <option value="phone">Téléphone manquant</option>
                    {admin && <option value="unassigned">Sans responsable</option>}
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
                    <strong>Clients</strong>
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
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  )) : (
                    <p className="wo-empty">
                      {clients.length
                        ? 'Aucun résultat pour cette recherche.'
                        : admin
                          ? 'Aucun client dans votre portefeuille.'
                          : 'Aucun client attribué. Contactez votre administratrice.'}
                    </p>
                  )}
                </section>
              )}

              {selected ? (
                <section className="wo-detail" aria-labelledby="wo-client-title">
                  <div className="wo-detail-top">
                    <span className="wo-avatar wo-avatar-large">
                      {initials(selected.full_name)}
                    </span>
                    <div>
                      <span className="wo-badge">Fiche client</span>
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

                      {dirty && <small>Modifications non enregistrées</small>}
                    </div>
                  </form>
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
