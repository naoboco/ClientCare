export type Plan = {
  id: string
  name: string
  price: number | string
  data_gb: number
  national_minutes: number
  international_minutes: number
  active: boolean
}

export type Subscription = {
  client_id: string
  plan_id: string | null
  required_data_gb: number | null
  required_france_minutes: number | null
  monthly_budget: number | string | null
}

export type SubscriptionClient = { id: string; full_name: string; needs: string }

export const subscriptionStatuses = {
  fit: 'Adaptés',
  review: 'À revoir',
  incomplete: 'À compléter',
} as const

export type SubscriptionStatus = keyof typeof subscriptionStatuses

export function formatPrice(value: number | string) {
  return Number(value).toLocaleString('fr-FR') + ' ₪'
}

function gaps(plan: Plan, needs: Subscription) {
  const reasons: string[] = []
  const data = needs.required_data_gb
  const calls = needs.required_france_minutes
  const budget = needs.monthly_budget

  if (data !== null && plan.data_gb < data) {
    reasons.push(data + ' Go nécessaires, ' + plan.data_gb + ' Go inclus.')
  }
  if (calls !== null && plan.international_minutes < calls) {
    reasons.push(calls + ' min vers la France nécessaires, ' + plan.international_minutes + ' min incluses.')
  }
  if (budget !== null && Number(plan.price) > Number(budget)) {
    reasons.push(formatPrice(plan.price) + ' par mois pour un budget de ' + formatPrice(budget) + '.')
  }
  return reasons
}

export function recommendPlan(plans: Plan[], needs: Subscription) {
  if ([needs.required_data_gb, needs.required_france_minutes, needs.monthly_budget].every(value => value === null)) {
    return undefined
  }
  return plans.reduce<Plan | undefined>((best, plan) => {
    if (!plan.active || gaps(plan, needs).length) return best
    return !best || Number(plan.price) < Number(best.price) ? plan : best
  }, undefined)
}

export function assessSubscription(
  subscription: Subscription | undefined,
  plan: Plan | undefined,
): { status: SubscriptionStatus; reasons: string[] } {
  if (!subscription?.plan_id) {
    return { status: 'incomplete', reasons: ['Forfait à attribuer.'] }
  }
  if (!plan?.active) {
    return { status: 'review', reasons: ['Le forfait attribué est indisponible.'] }
  }
  if ([subscription.required_data_gb, subscription.required_france_minutes, subscription.monthly_budget]
    .every(value => value === null)) {
    return { status: 'incomplete', reasons: ['Besoins à renseigner.'] }
  }
  const reasons = gaps(plan, subscription)
  return reasons.length
    ? { status: 'review', reasons }
    : { status: 'fit', reasons: ['Le forfait couvre les besoins renseignés.'] }
}
