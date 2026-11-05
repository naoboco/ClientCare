export function toDateTimeInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return String(date.getFullYear()).padStart(4, '0') + '-' +
    pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' +
    pad(date.getHours()) + ':' + pad(date.getMinutes())
}

export function fromDateTimeInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

export function formatContactDate(value: string | null): string {
  if (!value) return 'Non renseigné'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Non renseigné'
  return date.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function isOverdue(
  client: { next_followup_at: string | null }, now: number,
): boolean {
  if (!client.next_followup_at) return false
  const due = Date.parse(client.next_followup_at)
  return Number.isFinite(due) && due <= now
}
