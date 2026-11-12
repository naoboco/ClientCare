import { useEffect, useState, type FormEvent } from 'react'
import { db } from './lib/olimline'
import { portalError, type ClientJourney } from './lib/clientPortal'

type HouseholdLine = {
  id: string
  display_name: string
  relationship: 'partner' | 'child'
}

type HouseholdMember = HouseholdLine & { include_in_plan: boolean }

type HouseholdData = {
  members: HouseholdMember[]
  planMembers: HouseholdLine[] | null
}

const relationshipLabels = { partner: 'Partenaire', child: 'Enfant' }

async function loadHousehold(clientId: string, planId: string | undefined, signal: AbortSignal) {
  const members = await db().from('wo_client_household_members')
    .select('id, display_name, relationship, include_in_plan')
    .eq('client_id', clientId)
    .order('created_at')
    .abortSignal(signal)

  if (members.error?.code === 'PGRST205' || members.error?.code === '42P01') return null
  if (members.error) throw members.error

  let planMembers: HouseholdLine[] | null = null
  if (planId) {
    const plan = await db().from('wo_client_journeys').select('plan_members')
      .eq('id', planId).eq('client_id', clientId).abortSignal(signal).maybeSingle()
    if (plan.error) throw plan.error
    planMembers = (plan.data?.plan_members ?? null) as HouseholdLine[] | null
  }

  return { members: (members.data ?? []) as HouseholdMember[], planMembers }
}

export default function ClientHousehold({ clientId, holderName, journey, revision, editable = false, disabled = false }: {
  clientId: string
  holderName: string
  journey: ClientJourney | undefined
  revision: number
  editable?: boolean
  disabled?: boolean
}) {
  const planId = journey?.stage === 'collecting' ? undefined : journey?.id
  const [data, setData] = useState<HouseholdData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    loadHousehold(clientId, planId, controller.signal).then(
      result => {
        if (controller.signal.aborted) return
        setData(result)
        setError('')
        setBusy(false)
      },
      problem => {
        if (controller.signal.aborted) return
        setError(portalError(problem, 'Impossible de charger le foyer. Actualisez le dossier.'))
        setBusy(false)
      },
    )
    return () => controller.abort()
  }, [clientId, planId, revision, version])

  async function change(action: () => Promise<void>) {
    if (busy || disabled || !editable) return false
    setBusy(true)
    setError('')
    try {
      await action()
      setVersion(current => current + 1)
      return true
    } catch (problem) {
      const duplicate = problem && typeof problem === 'object' && 'code' in problem && problem.code === '23505'
      setError(duplicate ? 'Ce membre est déjà dans votre foyer.'
        : portalError(problem, 'Impossible de modifier le foyer. Réessayez.'))
      setBusy(false)
      return false
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const name = String(fields.get('name') ?? '').trim()
    if (!name) return

    const saved = await change(async () => {
      const { error: problem } = await db().from('wo_client_household_members').insert({
        client_id: clientId,
        display_name: name,
        relationship: fields.get('relationship'),
      })
      if (problem) throw problem
    })
    if (saved) form.reset()
  }

  async function changeMember(member: HouseholdMember, included: boolean | null) {
    await change(async () => {
      const table = db().from('wo_client_household_members')
      const query = included === null ? table.delete() : table.update({ include_in_plan: included })
      const { data: row, error: problem } = await query.eq('id', member.id).eq('client_id', clientId).select('id').maybeSingle()
      if (problem) throw problem
      if (!row) throw new Error('Ce membre n’est plus accessible. Actualisez le dossier.')
    })
  }

  if (!data && !error) return null

  const Heading = editable ? 'h2' : 'h4'
  const heading = editable ? 'Mon foyer' : 'Foyer du client'
  const lineCount = 1 + (data?.members.filter(member => member.include_in_plan).length ?? 0)
  const planMembers = data?.planMembers

  return (
    <section className={editable ? 'cp-panel cp-household' : 'cp-household'} aria-label={heading} aria-busy={busy}>
      <div className="cp-panel-heading">
        <Heading>{heading}</Heading>
        {data && <span className="cp-pill" aria-live="polite">
          {lineCount} {lineCount === 1 ? 'ligne souhaitée' : 'lignes souhaitées'}
        </span>}
      </div>
      {error && <p className="cp-error" role="alert">{error}</p>}
      {data && (
        <>
          {editable && <p className="cp-hint">
            {planMembers ? 'Les modifications du foyer serviront au prochain suivi.' : 'Choisissez les proches à inclure dans le forfait.'}
          </p>}
          <ul className="cp-document-list">
            <li className="cp-document cp-document-head">
              <strong>{holderName}</strong>
              <span className="cp-pill">Titulaire</span>
            </li>
            {data.members.map(member => (
              <li key={member.id} className="cp-document">
                <div className="cp-document-head">
                  <strong>{member.display_name}</strong>
                  <span className="cp-pill">{relationshipLabels[member.relationship]}</span>
                </div>
                {editable ? (
                  <div className="cp-household-actions">
                    <label>
                      <input type="checkbox" checked={member.include_in_plan} disabled={busy || disabled}
                        aria-label={'Inclure ' + member.display_name + ' dans le forfait'}
                        onChange={event => void changeMember(member, event.target.checked)} />
                      Inclure dans le forfait
                    </label>
                    <button type="button" className="cp-button cp-button-secondary" disabled={busy || disabled}
                      aria-label={'Retirer ' + member.display_name + ' du foyer'}
                      onClick={() => void changeMember(member, null)}>Retirer</button>
                  </div>
                ) : <p className="cp-hint">{member.include_in_plan ? 'Ligne souhaitée' : 'Membre du foyer'}</p>}
              </li>
            ))}
          </ul>

          {editable && (
            <form className="cp-form cp-household-add" onSubmit={addMember}>
              <label>Prénom ou nom d’usage
                <input name="name" required maxLength={120} disabled={busy || disabled} />
              </label>
              <label>Lien familial
                <select name="relationship" defaultValue="partner" disabled={busy || disabled}>
                  <option value="partner">Partenaire</option>
                  <option value="child">Enfant</option>
                </select>
              </label>
              <button type="submit" className="cp-button cp-button-secondary" disabled={busy || disabled}>Ajouter au foyer</button>
            </form>
          )}

          {journey && planMembers && (
            <div className="cp-reply cp-household-plan">
              <strong>{journey.product_name} · {planMembers.length + 1} {planMembers.length ? 'lignes prévues' : 'ligne prévue'}</strong>
              <p>Titulaire{planMembers.map(member => ', ' + member.display_name).join('')}</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
