import {
  choiceLabel, clientSourceOptions, communicationOptions, moduleGroups, operationsFor,
  organizationTypes, presenceLimit, presenceOptions, salesSourceOptions, styleOptions,
  type Choice, type PublicPresence, type QuestionnaireAnswers,
} from './lib/crmQuestionnaire'

type Props = {
  answers: QuestionnaireAnswers
  update: <K extends keyof QuestionnaireAnswers>(key: K, value: QuestionnaireAnswers[K]) => void
}

const dossierOptions: Choice[] = [
  ['assigned', 'Dossiers attribués'], ['department', 'Dossiers du département'],
  ['organization', 'Dossiers de l’organisation'],
]

const analysisAccessOptions: Choice[] = [
  ['admin', 'Administration'], ['supervisors', 'Administration et responsables'],
  ['staff', 'Toute l’équipe'],
]

function CheckGroup({ legend, choices, values, onChange }: {
  legend: string
  choices: readonly Choice[]
  values: string[]
  onChange: (values: string[]) => void
}) {
  return (
    <fieldset className="wo-quiz-group">
      <legend>{legend}</legend>
      <div className="wo-quiz-options">
        {choices.map(([key, label]) => (
          <label className="wo-quiz-check" key={key}>
            <input type="checkbox" checked={values.includes(key)} onChange={event => {
              onChange(event.target.checked ? [...values, key] : values.filter(value => value !== key))
            }} />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function SelectField({ label, value, choices, onChange }: {
  label: string
  value: string
  choices: readonly Choice[]
  onChange: (value: string) => void
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={event => onChange(event.target.value)}>
        {choices.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  )
}

function PublicChannels({ answers, update }: Props) {
  const channels = answers.public_presence
  const offline = answers.no_digital_presence
  const hasDigital = channels.some(channel => channel.kind !== 'physical')
  const available = offline ? presenceOptions.filter(([kind]) => kind === 'physical') : presenceOptions

  function edit(index: number, patch: Partial<PublicPresence>) {
    update('public_presence', channels.map((channel, i) => i === index ? { ...channel, ...patch } : channel))
  }

  return (
    <>
      <p className="wo-quiz-hint">Ajoutez les sites, boutiques et comptes qui présentent votre activité. Vous pouvez déclarer plusieurs canaux du même type.</p>
      <label className="wo-quiz-check">
        <input type="checkbox" checked={offline} disabled={hasDigital}
          onChange={event => update('no_digital_presence', event.target.checked)} />
        Aucun canal numérique actuellement
      </label>
      {channels.map((channel, index) => (
        <div className="wo-quiz-channel" key={index}>
          <SelectField label={`Type du canal ${index + 1}`} value={channel.kind} choices={available}
            onChange={kind => edit(index, { kind: kind as PublicPresence['kind'], reference: '' })} />
          <label>
            {channel.kind === 'physical' ? 'Adresse ou emplacement' : 'URL ou identifiant public'}
            <input maxLength={300} value={channel.reference}
              placeholder={channel.kind === 'physical' ? 'Adresse du magasin' : 'https:// ou identifiant du compte'}
              onChange={event => edit(index, { reference: event.target.value })} />
          </label>
          <button type="button" className="wo-button wo-quiet" aria-label={`Retirer le canal ${index + 1}`}
            onClick={() => update('public_presence', channels.filter((_, i) => i !== index))}>
            Retirer
          </button>
        </div>
      ))}
      <button type="button" className="wo-button wo-quiet wo-quiz-inline" disabled={channels.length >= presenceLimit}
        onClick={() => update('public_presence', [...channels, { kind: offline ? 'physical' : 'website', reference: '' }])}>
        {offline ? 'Ajouter un magasin physique' : 'Ajouter un canal'}
      </button>
      {channels.length >= presenceLimit && <p className="wo-quiz-hint">{presenceLimit} canaux maximum.</p>}
    </>
  )
}

function Review({ answers }: { answers: QuestionnaireAnswers }) {
  const labels = (choices: readonly Choice[], values: string[]) => values.map(value => choiceLabel(choices, value)).filter(Boolean).join(', ')
  const sources = answers.public_presence.map(channel => `${choiceLabel(presenceOptions, channel.kind)} · ${channel.reference}`)
  if (answers.no_digital_presence) sources.push('Aucun canal numérique actuellement')

  const rows = [
    ['Organisation', answers.organization_name], ['Type de structure', choiceLabel(organizationTypes, answers.organization_type)],
    ['Secteur', answers.industry], ['Activité', answers.description], ['Pays', answers.country], ['Langues', answers.languages],
    ['Clients ou bénéficiaires', answers.audience_size?.toLocaleString('fr-FR')], ['Objectifs', answers.goals],
    ['Fonctionnement', labels(operationsFor(answers.organization_type), answers.operations)],
    ['Coordinateurs', answers.team_size?.toLocaleString('fr-FR')], ['Métiers', answers.team_roles],
    ['Départements', answers.departments], ['Responsables d’équipe', answers.team_leads ? 'Oui' : 'Non'],
    ['Lecture des dossiers', choiceLabel(dossierOptions, answers.view_access)], ['Édition des dossiers', choiceLabel(dossierOptions, answers.edit_access)],
    ['Accès aux analyses', choiceLabel(analysisAccessOptions, answers.analysis_access)],
    ['Communications', labels(communicationOptions, answers.communication_channels)],
    ['Sources de clients', labels(clientSourceOptions, answers.client_sources)], ['Sources commerciales', labels(salesSourceOptions, answers.sales_sources)],
    ['Modules souhaités', labels(moduleGroups.flatMap(group => group.choices), answers.modules)],
    ['Style', choiceLabel(styleOptions, answers.interface_style)],
  ]

  return (
    <div className="wo-quiz-review">
      <dl>
        {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}
      </dl>
      <h3>Présence commerciale</h3>
      <ul>{sources.map((source, index) => <li key={index}>{source}</li>)}</ul>
      <p className="wo-quiz-hint">Vos réponses serviront de base à la future proposition de CRM.</p>
    </div>
  )
}

export default function CrmQuestionnaireSteps({ step, answers, update }: Props & { step: number }) {
  switch (step) {
    case 0:
      return <>
        <div className="wo-form-grid">
          <label>Nom de l’organisation
            <input required maxLength={120} value={answers.organization_name}
              onChange={event => update('organization_name', event.target.value)} />
          </label>
          <SelectField label="Type de structure" value={answers.organization_type}
            choices={[[ '', 'Choisir un type' ], ...organizationTypes]} onChange={type => {
              const available = operationsFor(type).map(([key]) => key)
              update('organization_type', type)
              update('operations', answers.operations.filter(value => available.includes(value)))
            }} />
          <label>Secteur d’activité
            <input maxLength={120} value={answers.industry} onChange={event => update('industry', event.target.value)} />
          </label>
          <label>Pays principal
            <input maxLength={80} value={answers.country} onChange={event => update('country', event.target.value)} />
          </label>
          <label>Langues utilisées
            <input maxLength={120} value={answers.languages} onChange={event => update('languages', event.target.value)} />
          </label>
          <label>Nombre approximatif de clients ou bénéficiaires
            <input type="number" min={0} max={100000000} value={answers.audience_size ?? ''}
              onChange={event => update('audience_size', event.target.value === '' ? null : event.target.valueAsNumber)} />
          </label>
        </div>
        <label>Décrivez votre activité
          <textarea rows={3} maxLength={1500} value={answers.description} onChange={event => update('description', event.target.value)} />
        </label>
        <label>Vos objectifs principaux
          <textarea rows={3} maxLength={1500} value={answers.goals} onChange={event => update('goals', event.target.value)} />
        </label>
      </>
    case 1:
      return <CheckGroup legend="Quelles activités gérez-vous ?" choices={operationsFor(answers.organization_type)}
        values={answers.operations} onChange={values => update('operations', values)} />
    case 2:
      return <PublicChannels answers={answers} update={update} />
    case 3:
      return <>
        <div className="wo-form-grid">
          <label>Nombre de coordinateurs ou employés
            <input type="number" min={0} max={10000} value={answers.team_size ?? ''}
              onChange={event => update('team_size', event.target.value === '' ? null : event.target.valueAsNumber)} />
          </label>
          <label>Métiers ou rôles de l’équipe
            <input maxLength={500} value={answers.team_roles} onChange={event => update('team_roles', event.target.value)} />
          </label>
          <label>Départements ou équipes
            <input maxLength={300} value={answers.departments} onChange={event => update('departments', event.target.value)} />
          </label>
          <label className="wo-quiz-check">
            <input type="checkbox" checked={answers.team_leads} onChange={event => update('team_leads', event.target.checked)} />
            Prévoir des responsables d’équipe
          </label>
        </div>
        <p className="wo-quiz-hint">Indiquez les droits souhaités pour la future configuration de l’équipe.</p>
        <div className="wo-form-grid">
          <SelectField label="Quels dossiers les coordinateurs peuvent-ils voir ?" choices={dossierOptions} value={answers.view_access}
            onChange={value => update('view_access', value)} />
          <SelectField label="Quels dossiers peuvent-ils modifier ?" choices={dossierOptions} value={answers.edit_access}
            onChange={value => update('edit_access', value)} />
          <SelectField label="Qui pourra consulter les analyses ?" choices={analysisAccessOptions} value={answers.analysis_access}
            onChange={value => update('analysis_access', value)} />
        </div>
      </>
    case 4:
      return <>
        <p className="wo-quiz-hint">Sélectionnez les canaux utilisés. Les adresses et fournisseurs d’IA se renseignent dans Configuration.</p>
        <CheckGroup legend="Canaux utilisés" choices={communicationOptions} values={answers.communication_channels}
          onChange={values => update('communication_channels', values)} />
      </>
    case 5:
      return <>
        <CheckGroup legend="Comment récupérez-vous votre liste de clients ?" choices={clientSourceOptions} values={answers.client_sources}
          onChange={values => update('client_sources', values)} />
        <p className="wo-quiz-hint">L’import CSV de clients se fait depuis Configuration, avec aperçu et confirmation.</p>
        <h3 lang="en">Connect your sales channels</h3>
        <p className="wo-quiz-hint">Indiquez les sources que vous souhaitez raccorder pour le pilotage commercial. Leur statut sera vérifié au moment du raccordement.</p>
        <CheckGroup legend="Sources commerciales souhaitées" choices={salesSourceOptions} values={answers.sales_sources}
          onChange={values => update('sales_sources', values)} />
      </>
    case 6:
      return <>
        <p className="wo-quiz-hint">Choisissez les fonctionnalités qui vous intéressent pour la proposition de CRM.</p>
        {moduleGroups.map(group => <CheckGroup key={group.label} legend={group.label} choices={group.choices}
          values={answers.modules} onChange={values => update('modules', values)} />)}
      </>
    case 7:
      return <fieldset className="wo-quiz-group">
        <legend>Styles Watchover</legend>
        <div className="wo-quiz-styles">
          {styleOptions.map(([key, label]) => (
            <label className="wo-quiz-style" key={key}>
              <img src={`/watchover/styles/${key}.webp`} alt="" loading="lazy" />
              <span className="wo-quiz-check">
                <input type="radio" name="interface-style" checked={answers.interface_style === key}
                  onChange={() => update('interface_style', key)} />
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    default:
      return <Review answers={answers} />
  }
}
