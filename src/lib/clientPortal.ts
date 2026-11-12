import { db } from './olimline'

export const clientPortalPath = '#/olimline/client'
export const documentFileTypes = 'application/pdf,image/jpeg,image/png'
const documentBucket = 'wo-client-documents'
const maxDocumentBytes = 10 * 1024 * 1024

export type PortalContact = {
  id: string
  full_name: string
  email: string
  phone: string
  contact_confirmed: boolean
  coordinator_name: string | null
}

export type JourneyStage = 'collecting' | 'processing' | 'delivered'

export type ClientJourney = {
  id: string
  product_name: string
  stage: JourneyStage
  delivered_at: string | null
}

export type PortalDocument = {
  id: string
  label: string
  status: 'missing' | 'submitted' | 'approved' | 'rejected'
  storage_path: string
  file_name: string | null
  review_note: string
  upload_received: boolean
}

export const documentStatuses: Record<PortalDocument['status'], string> = {
  missing: 'À fournir',
  submitted: 'En cours de vérification',
  approved: 'Validé',
  rejected: 'À remplacer',
}

export const journeyStages: Record<JourneyStage, string> = {
  collecting: 'Dossier à compléter',
  processing: 'Traitement en cours',
  delivered: 'Produit livré',
}

export const requestKinds = {
  new_product: 'Nouveau produit',
  technical_issue: 'Problème technique',
}

export const requestStatuses = {
  new: 'Reçue',
  in_progress: 'En cours',
  resolved: 'Résolue',
}

export type RequestKind = keyof typeof requestKinds
export type RequestStatus = keyof typeof requestStatuses

export type ClientRequest = {
  id: string
  client_id: string
  kind: RequestKind
  product_name: string
  description: string
  status: RequestStatus
  reply: string
  created_at: string
  updated_at: string
}

export const requestFields = 'id, client_id, kind, product_name, description, status, reply, created_at, updated_at'

export function portalDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value))
}

export function portalError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'code' in error && error.code === '22023' && 'message' in error) {
    return String(error.message)
  }
  return fallback
}

export async function loadPortalContact(signal: AbortSignal) {
  const { data, error } = await db().rpc('wo_portal_contact').abortSignal(signal).maybeSingle()
  if (error) throw error
  return data as PortalContact | null
}

export async function loadClientJourneys(clientId: string, signal: AbortSignal) {
  const { data, error } = await db().from('wo_client_journeys')
    .select('id, product_name, stage, delivered_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(20)
    .abortSignal(signal)
  if (error) throw error
  return (data ?? []) as ClientJourney[]
}

export async function loadPortalChecklist(journeyId: string, signal: AbortSignal) {
  const { data, error } = await db()
    .rpc('wo_portal_checklist', { p_journey_id: journeyId }).abortSignal(signal)
  if (error) throw error
  return (data ?? []) as PortalDocument[]
}

export async function portalCommand(name: string, parameters: Record<string, string | boolean>) {
  const { error } = await db().rpc(name, parameters)
  if (error) throw error
}

export async function submitPortalDocument(document: PortalDocument, file: File | null) {
  if (!document.upload_received) {
    if (!file || file.size === 0) throw new Error('Sélectionnez un fichier à déposer.')
    if (file.size > maxDocumentBytes || !documentFileTypes.split(',').includes(file.type)) {
      throw new Error('Utilisez un PDF, un JPG ou un PNG de 10 Mo maximum.')
    }

    const { error } = await db().storage.from(documentBucket).upload(document.storage_path, file, {
      contentType: file.type,
      metadata: { file_name: file.name },
      upsert: false,
    })
    if (error) throw new Error('Le transfert a échoué. Actualisez la liste des pièces et réessayez.')
  }

  await portalCommand('wo_portal_submit_document', {
    p_document_id: document.id,
    p_storage_path: document.storage_path,
  })
}

export async function downloadPortalDocument(document: PortalDocument) {
  const { data, error } = await db().storage.from(documentBucket).download(document.storage_path)
  if (error || !data) throw new Error('Le document est indisponible. Actualisez la liste des pièces.')

  const url = URL.createObjectURL(data)
  const link = window.document.createElement('a')
  link.href = url
  link.download = (document.file_name ?? document.label).replace(/[\\/]/g, '_')
  window.document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
