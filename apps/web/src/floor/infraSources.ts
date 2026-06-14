import type { InfraStatus, InfraSourceDomain, InfraSourceState } from '@trading-office/office-gateway';

export function sourceState(infra: InfraStatus | null | undefined, domain: InfraSourceDomain): InfraSourceState | undefined {
  return infra?.sources?.find((s) => s.domain === domain)?.state;
}
export const isGap = (state: InfraSourceState | undefined): boolean => state === 'gap';
