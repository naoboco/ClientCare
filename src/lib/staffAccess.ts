import type { Role } from './auth'

export type StaffRole = Exclude<Role, 'client'>

export const staffLoginPaths: Record<StaffRole, string> = {
  admin: '#/watchover/equipe/administration',
  coordinator: '#/watchover/equipe/coordination',
}

export const teamAccessPath = '#/watchover/equipe/invitations'
export const crmQuestionnairePath = '#/watchover/configurer-crm'
export const staffInvitePath = '#/watchover/equipe/invitation/'
export const inviteTokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/
