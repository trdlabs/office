export const OFFICE_API = {
  agentStatuses: '/api/office/agents/statuses',
  agentActivityPattern: '/api/office/agents/:agentId/activity',
  agentActivity: (agentId: string) => `/api/office/agents/${encodeURIComponent(agentId)}/activity`,
  hypotheses: '/api/office/hypotheses',
  backtests: '/api/office/backtests',
  bots: '/api/office/bots',
  knowledge: '/api/office/knowledge',
  infra: '/api/office/infra',
  operatorMessages: '/api/office/operator/messages',
  events: '/api/office/events',
} as const;
