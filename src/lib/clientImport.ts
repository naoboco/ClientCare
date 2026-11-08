import Papa from 'papaparse'

export const clientImportLimit = 500

type ClientToImport = {
  full_name: string
  email: string
  phone: string
  needs: string
}

export type ClientImportPreview = {
  clients: ClientToImport[]
  ignored: string[]
}

export function parseClientCsv(text: string): ClientImportPreview {
  if (!text.trim() || text.includes('\0')) {
    throw new Error('Choisissez un fichier CSV UTF-8 contenant des clients.')
  }

  const { data, errors } = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', ';', '\t'],
  })

  if (errors.some(error => error.code !== 'UndetectableDelimiter')) {
    throw new Error('Le fichier CSV est mal formé. Exportez-le de nouveau puis réessayez.')
  }

  const [header = [], ...records] = data
  const columns = header.map(value => value.normalize('NFD')
    .replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, ''))
  const column = (...names: string[]) => columns.findIndex(value => names.includes(value))

  const fullName = column('nomcomplet', 'fullname', 'name', 'client')
  const firstName = column('prenom', 'firstname', 'givenname')
  const lastName = column('nom', 'nomdefamille', 'lastname', 'surname')
  const emailColumn = column('email', 'emailaddress', 'adresseemail', 'courriel', 'mail')
  const phoneColumn = column('telephone', 'tel', 'phone', 'phonenumber', 'mobile')
  const needsColumn = column('besoins', 'needs', 'notes', 'commentaire', 'comments')

  if (emailColumn < 0 || Math.max(fullName, firstName, lastName) < 0) {
    throw new Error('La première ligne doit contenir les colonnes Nom et Email.')
  }
  if (records.length === 0 || records.length > clientImportLimit) {
    throw new Error(`Le fichier doit contenir de 1 à ${clientImportLimit} lignes de clients.`)
  }

  const clients: ClientToImport[] = []
  const ignored: string[] = []
  const emails = new Set<string>()

  records.forEach((record, index) => {
    const read = (position: number) => record[position]?.trim() ?? ''
    const name = read(fullName) || [read(firstName), read(lastName)].filter(Boolean).join(' ')
    const email = read(emailColumn).toLowerCase()
    const phone = read(phoneColumn).replace(/^'(?=\+)/, '')
    const needs = read(needsColumn)
    const label = `Fiche ${index + 1}`

    if (record.length > header.length) {
      ignored.push(`${label} · Colonnes en trop`)
    } else if (!name || name.length > 160) {
      ignored.push(`${label} · Nom manquant ou trop long`)
    } else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ignored.push(`${label} · Adresse e-mail manquante ou invalide`)
    } else if (phone.length > 60 || needs.length > 2000) {
      ignored.push(`${label} · Téléphone ou besoins trop longs`)
    } else if (emails.has(email)) {
      ignored.push(`${label} · Adresse déjà présente dans le fichier`)
    } else {
      emails.add(email)
      clients.push({ full_name: name, email, phone, needs })
    }
  })

  return { clients, ignored }
}
