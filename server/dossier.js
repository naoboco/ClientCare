import { geminiSettings, generateGeminiJson, GeminiError } from './gemini.js'

function availableActions(stage, contactConfirmed, counts) {
  if (stage === 'delivered') return ['follow_up']
  if (stage === 'processing') return ['prepare_delivery']
  const actions = []
  if (!contactConfirmed) actions.push('confirm_contact')
  if (counts.missing) actions.push('collect_missing')
  if (counts.rejected) actions.push('collect_replacements')
  if (counts.submitted) actions.push('review_submissions')
  return actions.length ? actions : ['start_processing']
}

export async function analyzeDossier({ db, client, journeyId, env, fetchImpl, signal, res }) {
  const { data: journey, error: journeyError } = await db.from('wo_client_journeys')
    .select('stage').eq('id', journeyId).eq('client_id', client.id).abortSignal(signal).maybeSingle()
  if (journeyError) return res.status(502).json({ error: 'Le suivi du dossier est indisponible.' })
  if (!journey) return res.status(404).json({ error: 'Le suivi de ce dossier est introuvable.' })

  const { data: documents, error: documentError } = await db.from('wo_client_documents')
    .select('status').eq('journey_id', journeyId).abortSignal(signal)
  if (documentError) return res.status(502).json({ error: 'La liste des pièces est indisponible.' })

  const counts = { missing: 0, submitted: 0, approved: 0, rejected: 0 }
  for (const document of documents) {
    if (Object.hasOwn(counts, document.status)) counts[document.status] += 1
  }
  const contactConfirmed = Boolean(client.portal_contact_confirmed_at && client.phone.trim())
  const snapshot = { stage: journey.stage, contactConfirmed, counts }
  const actions = availableActions(journey.stage, contactConfirmed, counts)
  const result = await generateGeminiJson({
    settings: geminiSettings(env, 'le suivi des dossiers'),
    fetchImpl,
    signal,
    instruction: 'Priorise les actions disponibles pour le coordinateur d’un dossier de téléphonie. ' +
      'Appuie-toi sur l’étape, le statut des coordonnées et le nombre de pièces à chaque statut. ' +
      'Renvoie toutes les actions proposées une seule fois, de la plus urgente à la moins urgente. ' +
      'Pour chaque priorité, explique son intérêt en une phrase en français, sans inventer de délai ni de résultat.',
    input: { ...snapshot, availableActions: actions },
    schema: {
      type: 'object',
      properties: {
        priorities: {
          type: 'array', minItems: actions.length, maxItems: actions.length,
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: actions },
              reason: { type: 'string', description: 'Une phrase en français, 220 caractères maximum.' },
            },
            required: ['action', 'reason'], additionalProperties: false,
          },
        },
      },
      required: ['priorities'], additionalProperties: false,
    },
    maxOutputTokens: 2048,
  })

  const priorities = result?.priorities
  if (!Array.isArray(priorities) || priorities.length !== actions.length ||
    !priorities.every(item => item && actions.includes(item.action) && typeof item.reason === 'string' &&
      item.reason.trim().length > 0 && item.reason.length <= 220) ||
    new Set(priorities.map(item => item.action)).size !== actions.length) {
    throw new GeminiError(502, 'Les priorités Gemini sont incomplètes. Réessayez.')
  }
  return res.json({ snapshot, priorities: priorities.map(({ action, reason }) => ({ action, reason })) })
}
