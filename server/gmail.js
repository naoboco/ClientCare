import addresses from 'email-addresses'
import { convert } from 'html-to-text'

const gmailBase = 'https://gmail.googleapis.com/gmail/v1/users/me'
const maxHistoryBytes = 800_000
const historyTooLarge = 'L’historique dépasse la taille prise en charge pour une analyse.'
const participantHeaders = new Set(['from', 'to', 'cc', 'bcc'])

export class GmailError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function gmailAddress(value) {
  if (typeof value !== 'string') return null
  const address = value.trim().toLowerCase()
  return address.length <= 254 && /^[^\s@"\\<>{},()[\]:;]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(address)
    ? address
    : null
}

function header(part, name) {
  return part.headers?.find(value => value.name.toLowerCase() === name)?.value || ''
}

function hasAddress(value, email) {
  const parsed = addresses.parseAddressList({ input: value, rfc6532: true }) ?? []
  return parsed.flatMap(item => item.type === 'group' ? item.addresses : [item])
    .some(item => item.address?.toLowerCase() === email)
}

async function readBody(part, readAttachment) {
  if (part.filename || /^attachment\b/i.test(header(part, 'content-disposition'))) return ''

  if (part.mimeType === 'multipart/alternative') {
    const alternatives = [...(part.parts ?? [])]
    alternatives.sort((a, b) => Number(b.mimeType === 'text/plain') - Number(a.mimeType === 'text/plain'))
    for (const alternative of alternatives) {
      const text = await readBody(alternative, readAttachment)
      if (text) return text
    }
    return ''
  }

  if (part.mimeType?.startsWith('multipart/')) {
    const texts = []
    for (const child of part.parts ?? []) {
      const text = await readBody(child, readAttachment)
      if (text) texts.push(text)
    }
    return texts.join('\n\n')
  }

  if (part.mimeType !== 'text/plain' && part.mimeType !== 'text/html') return ''
  if (part.body?.size > maxHistoryBytes) throw new GmailError(413, historyTooLarge)
  const encoded = part.body?.data ?? (part.body?.attachmentId
    ? (await readAttachment(part.body.attachmentId)).data
    : '')
  const bytes = Buffer.from(encoded || '', 'base64url')
  if (bytes.length > maxHistoryBytes) throw new GmailError(413, historyTooLarge)
  const charset = /\bcharset\s*=\s*["']?([^"';\s]+)/i.exec(header(part, 'content-type'))?.[1] ?? 'utf-8'
  let decoder
  try { decoder = new TextDecoder(charset) } catch { decoder = new TextDecoder() }
  const text = decoder.decode(bytes)
  return (part.mimeType === 'text/html' ? convert(text, {
    wordwrap: false,
    limits: { maxInputLength: maxHistoryBytes },
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  }) : text).trim()
}

export async function readGmailHistory({ accessToken, mailbox, email, fetchImpl, signal }) {
  async function get(path) {
    const response = await fetchImpl(gmailBase + path, {
      headers: { Authorization: 'Bearer ' + accessToken },
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    })
    if (response.status === 401) throw new GmailError(401, 'La boîte Gmail doit être reconnectée.')
    if (response.status === 403) throw new GmailError(403, 'Gmail a refusé l’accès. Vérifiez l’autorisation en lecture de la boîte.')
    if (response.status === 429) throw new GmailError(429, 'Le quota Gmail est atteint. Réessayez dans quelques instants.')
    if (!response.ok) throw new GmailError(502, 'Gmail n’a pas pu charger l’intégralité des échanges. Réessayez.')
    return response.json()
  }

  const profile = await get('/profile?fields=emailAddress')
  if (gmailAddress(profile.emailAddress) !== mailbox) {
    throw new GmailError(409, 'Connectez la boîte Gmail de l’entreprise configurée pour cet espace.')
  }

  async function readMessage(id) {
    const path = '/messages/' + encodeURIComponent(id)
    const { labelIds, payload, internalDate } = await get(path + '?format=full&fields=labelIds,internalDate,payload')
    if (!payload || labelIds?.some(label => ['DRAFT', 'SPAM', 'TRASH'].includes(label))) return null
    if (!payload.headers?.some(item =>
      participantHeaders.has(item.name.toLowerCase()) && hasAddress(item.value, email)
    )) return null

    const sender = header(payload, 'from')
    const timestamp = Number(internalDate)
    return {
      date: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : null,
      sens: hasAddress(sender, email) ? 'reçu du client' : hasAddress(sender, mailbox) ? 'envoyé au client' : 'client destinataire ou en copie',
      sujet: header(payload, 'subject'),
      texte: await readBody(payload, id => get(path + '/attachments/' + encodeURIComponent(id))),
    }
  }

  const query = new URLSearchParams({
    q: '{' + [...participantHeaders].map(name => `${name}:"${email}"`).join(' ') + '} -in:drafts',
    maxResults: '100',
    fields: 'messages(id),nextPageToken',
  })
  const seen = new Set()
  const pages = new Set()
  const messages = []
  let bytes = 2
  let pageToken
  do {
    if (pageToken) query.set('pageToken', pageToken)
    const page = await get('/messages?' + query)
    const ids = (page.messages ?? []).map(item => item.id).filter(id => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    for (let i = 0; i < ids.length; i += 6) {
      const results = await Promise.all(ids.slice(i, i + 6).map(readMessage))
      for (const message of results) {
        if (!message) continue
        bytes += Buffer.byteLength(JSON.stringify(message)) + 1
        if (bytes > maxHistoryBytes) throw new GmailError(413, historyTooLarge)
        messages.push(message)
      }
    }
    pageToken = page.nextPageToken
    if (pageToken && pages.has(pageToken)) throw new GmailError(502, 'Gmail a renvoyé une page en double. Réessayez.')
    pages.add(pageToken)
  } while (pageToken)

  return messages.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
}
