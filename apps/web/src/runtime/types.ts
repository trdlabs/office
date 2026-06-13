// Single source of truth for the wire contract is the office-gateway package.
// Re-export its types so existing app imports (`'../runtime/types'`) keep working.
export type * from '@trading-office/office-gateway';
