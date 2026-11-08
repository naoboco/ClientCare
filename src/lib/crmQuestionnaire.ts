export type Choice = readonly [value: string, label: string]

export const organizationTypes = [
  ['commerce', 'Commerce ou boutique'], ['association', 'Association'],
  ['services', 'Entreprise de services'], ['formation', 'Formation ou éducation'],
  ['immobilier', 'Immobilier'], ['accompagnement', 'Accompagnement ou intégration'],
  ['independant', 'Indépendant'], ['technologie', 'Entreprise technologique'],
  ['autre', 'Autre structure'],
] as const

const commonOperations: Choice[] = [
  ['contacts', 'Suivre les contacts'], ['requests', 'Traiter les demandes'],
  ['tasks', 'Organiser les tâches'],
]

const serviceOperations: Choice[] = [
  ['appointments', 'Rendez-vous'], ['contracts', 'Contrats'], ['billing', 'Devis et factures'],
  ['projects', 'Projets'], ['support', 'Service après-vente'],
]

const operationsByType: Record<string, Choice[]> = {
  commerce: [
    ['products', 'Vente de produits'], ['services', 'Vente de services'],
    ['shop', 'Magasin physique'], ['online', 'Boutique en ligne'],
    ['orders', 'Commandes'], ['stock', 'Stocks'], ['sales', 'Prospects et ventes'],
    ['loyalty', 'Fidélisation'],
  ],
  association: [
    ['beneficiaries', 'Bénéficiaires'], ['volunteers', 'Bénévoles'], ['donations', 'Dons et campagnes'],
    ['aid', 'Demandes d’aide'], ['events', 'Événements'], ['cases', 'Suivi des dossiers'],
  ],
  services: serviceOperations,
  independant: serviceOperations,
  technologie: serviceOperations,
  formation: [['learners', 'Apprenants'], ['courses', 'Formations'], ['registration', 'Inscriptions'], ['progress', 'Suivi des parcours']],
  immobilier: [['properties', 'Biens immobiliers'], ['visits', 'Visites'], ['sales', 'Prospects et ventes'], ['contracts', 'Contrats']],
  accompagnement: [['beneficiaries', 'Bénéficiaires'], ['cases', 'Suivi des dossiers'], ['appointments', 'Rendez-vous'], ['aid', 'Demandes d’aide']],
}

export function operationsFor(type: string): Choice[] {
  return [...(operationsByType[type] ?? []), ...commonOperations]
}

export const presenceOptions = [
  ['website', 'Site internet officiel'], ['store', 'Boutique e-commerce'],
  ['instagram', 'Instagram Business'], ['facebook', 'Facebook Business'],
  ['tiktok', 'TikTok Business'], ['whatsapp', 'WhatsApp Business'],
  ['marketplace', 'Amazon ou autre marketplace'], ['app', 'Application mobile'],
  ['physical', 'Magasin physique'],
] as const

export type PublicPresence = { kind: typeof presenceOptions[number][0]; reference: string }
export const presenceLimit = 15

export const communicationOptions: Choice[] = [
  ['gmail', 'Gmail'], ['outlook', 'Outlook / Microsoft 365'], ['whatsapp', 'WhatsApp Business'],
  ['email', 'E-mail professionnel'], ['forms', 'Formulaires du site'],
  ['phone', 'Téléphone'], ['sms', 'SMS'], ['internal', 'Messagerie interne'],
]

export const clientSourceOptions: Choice[] = [
  ['csv', 'Fichier CSV'], ['excel', 'Excel'], ['sheets', 'Google Sheets'],
  ['crm', 'Autre CRM'], ['manual', 'Création manuelle'],
]

export const salesSourceOptions: Choice[] = [
  ['shopify', 'Shopify'], ['woocommerce', 'WooCommerce'], ['wix', 'Wix eCommerce'],
  ['stripe', 'Stripe'], ['paypal', 'PayPal'], ['analytics', 'Google Analytics 4'],
  ['meta', 'Meta Business'], ['ads', 'Google Ads'], ['pos', 'Caisse ou autre système de vente'],
  ['csv', 'Import CSV'], ['excel', 'Excel'], ['sheets', 'Google Sheets'],
]

export const moduleGroups: { label: string; choices: Choice[] }[] = [
  { label: 'Gestion', choices: [
    ['contacts', 'Fiches clients'], ['leads', 'Prospects'], ['sales', 'Suivi commercial'],
    ['cases', 'Dossiers'], ['agenda', 'Agenda'], ['tasks', 'Tâches'], ['forms', 'Formulaires'],
    ['documents', 'Documents'], ['campaigns', 'Campagnes et événements'],
    ['reminders', 'Notifications et rappels'], ['workflows', 'Pipelines et automatisations'],
  ] },
  { label: 'IA Communication', choices: [
    ['email', 'Assistant e-mail'], ['communication', 'Assistant de communication'],
    ['summaries', 'Résumés des échanges'], ['priority', 'Détection des dossiers prioritaires'],
  ] },
  { label: 'IA Pilotage', choices: [
    ['performance', 'Analyse commerciale'], ['team', 'Analyse de l’activité de l’équipe'],
    ['clients', 'Analyse des clients'], ['forecast', 'Prévisions et tendances'],
    ['competitors', 'Veille concurrentielle'], ['sector', 'Veille sectorielle'],
    ['regulation', 'Veille réglementaire'], ['research', 'Recherche documentaire'],
    ['reports', 'Rapports'], ['strategy', 'Assistant stratégique'],
  ] },
]

export const styleOptions = [['classic', 'Classic'], ['formal', 'Formal'], ['gaming', 'Gaming'], ['cartoon', 'Cartoon']] as const

export type QuestionnaireAnswers = {
  organization_name: string
  organization_type: string
  industry: string
  description: string
  country: string
  languages: string
  audience_size: number | null
  goals: string
  operations: string[]
  public_presence: PublicPresence[]
  no_digital_presence: boolean
  team_size: number | null
  team_roles: string
  departments: string
  team_leads: boolean
  view_access: string
  edit_access: string
  analysis_access: string
  communication_channels: string[]
  client_sources: string[]
  sales_sources: string[]
  modules: string[]
  interface_style: string
}

export const initialAnswers: QuestionnaireAnswers = {
  organization_name: '', organization_type: '', industry: '', description: '',
  country: '', languages: '', audience_size: null, goals: '', operations: [],
  public_presence: [], no_digital_presence: false, team_size: null, team_roles: '',
  departments: '', team_leads: false, view_access: 'assigned', edit_access: 'assigned',
  analysis_access: 'admin', communication_channels: [], client_sources: [], sales_sources: [],
  modules: [], interface_style: '',
}

export const steps = [
  ['Identité', 'Parlons de votre organisation'],
  ['Activité', 'Comment travaillez-vous au quotidien ?'],
  ['Présence', 'Where can customers find your business?'],
  ['Équipe', 'Qui utilisera votre CRM ?'],
  ['Communication', 'Comment échangez-vous avec vos contacts ?'],
  ['Données', 'Quelles données souhaitez-vous récupérer ?'],
  ['Modules', 'Quels outils vous seraient utiles ?'],
  ['Style', 'Quel style correspond à votre entreprise ?'],
  ['Récapitulatif', 'Vérifiez vos réponses'],
] as const

export function stepError(step: number, answers: QuestionnaireAnswers) {
  if (step === 0 && (!answers.organization_name.trim() || !answers.organization_type)) {
    return 'Renseignez le nom et le type de votre organisation.'
  }
  if (step === 2) {
    if (!answers.public_presence.length && !answers.no_digital_presence) {
      return 'Ajoutez un canal ou indiquez que vous n’avez pas de canal numérique.'
    }
    for (const channel of answers.public_presence) {
      if (!channel.reference.trim()) return 'Renseignez chaque canal ajouté.'
      if ((channel.kind === 'website' || channel.kind === 'store')
        && !/^https?:\/\/[^\s@/?#]+(?:[/?#][^\s]*)?$/i.test(channel.reference.trim())) {
        return 'Pour les sites et boutiques, saisissez une URL commençant par https:// ou http://.'
      }
    }
  }
  if (step === 7 && !answers.interface_style) return 'Choisissez un style pour votre interface.'
  return ''
}

export function choiceLabel(choices: readonly Choice[], value: string) {
  return choices.find(([key]) => key === value)?.[1] ?? ''
}
