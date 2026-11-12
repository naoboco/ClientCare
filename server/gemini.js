export class GeminiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function geminiSettings(env, purpose) {
  if (!env.GEMINI_API_KEY) throw new GeminiError(503, 'La clé GEMINI_API_KEY doit être ajoutée dans Vercel.')
  if (env.GEMINI_PAID_PROJECT !== 'true') {
    throw new GeminiError(503, 'L’administration doit valider la configuration Gemini pour ' + purpose + '.')
  }
  const model = env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
  if (!/^gemini-[a-z0-9.-]+$/.test(model)) throw new GeminiError(503, 'Configuration du modèle Gemini invalide.')
  return { apiKey: env.GEMINI_API_KEY, model }
}

export async function generateGeminiJson({ settings, fetchImpl, signal, instruction, input, schema, maxOutputTokens }) {
  const upstream = await fetchImpl(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(settings.model) + ':generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: {
          maxOutputTokens,
          responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema } },
        },
      }),
    },
  )
  if (!upstream.ok) {
    const message = upstream.status === 429 ? 'Quota Gemini atteint. Réessayez plus tard.'
      : [401, 403].includes(upstream.status) ? 'La clé Gemini n’est pas autorisée.'
      : upstream.status === 404 ? 'Le modèle Gemini configuré est indisponible.'
      : 'Gemini a refusé la demande. Vérifiez sa configuration.'
    throw new GeminiError(upstream.status === 429 ? 429 : 502, message)
  }

  const payload = await upstream.json()
  const candidate = payload.candidates?.[0]
  if (candidate?.finishReason !== 'STOP') throw new GeminiError(502, 'Gemini a produit une réponse incomplète. Réessayez.')
  const text = candidate.content?.parts?.filter(part => !part.thought && typeof part.text === 'string')
    .map(part => part.text).join('') || ''
  try {
    return JSON.parse(text)
  } catch {
    throw new GeminiError(502, 'La réponse Gemini ne respecte pas le format attendu.')
  }
}
