import { describe, expect, it } from 'vitest';
import { resolvePanel, selectedEntityId, type FloorAgentInfo } from './panelRegistry';

const agents: FloorAgentInfo[] = [
  { id: 'boss', role: 'boss' },
  { id: 'researcher', role: 'researcher' },
];
const targetToObject = { 'backtest-summary': 'wall-monitor', 'infra-status': 'server-rack' };

describe('resolvePanel', () => {
  it('routes the boss to the activity panel like any other agent', () => {
    expect(resolvePanel({ agentId: 'boss' }, agents)).toEqual({ kind: 'agent-activity', agentId: 'boss' });
  });
  it('routes other agents to the activity panel', () => {
    expect(resolvePanel({ agentId: 'researcher' }, agents)).toEqual({ kind: 'agent-activity', agentId: 'researcher' });
  });
  it('opens the operator chat from the /operator shell route (not a floor entity)', () => {
    expect(resolvePanel({ operator: true }, agents)).toEqual({ kind: 'operator-chat' });
  });
  it('flags unknown agents', () => {
    expect(resolvePanel({ agentId: 'ghost' }, agents)).toEqual({ kind: 'unknown', key: 'agent:ghost' });
  });
  it('routes known object targets', () => {
    expect(resolvePanel({ panelTarget: 'backtest-summary' }, agents)).toEqual({ kind: 'object', panelTarget: 'backtest-summary' });
  });
  it('routes exit specially', () => {
    expect(resolvePanel({ panelTarget: 'exit' }, agents)).toEqual({ kind: 'exit' });
  });
  it('flags unknown object targets', () => {
    expect(resolvePanel({ panelTarget: 'nope' }, agents)).toEqual({ kind: 'unknown', key: 'panel:nope' });
  });
  it('returns none with no selection', () => {
    expect(resolvePanel({}, agents)).toEqual({ kind: 'none' });
  });
});

describe('selectedEntityId', () => {
  it('selects no floor entity for the operator chat', () => {
    expect(selectedEntityId({ kind: 'operator-chat' }, targetToObject)).toBeNull();
  });
  it('selects an agent', () => {
    expect(selectedEntityId({ kind: 'agent-activity', agentId: 'researcher' }, targetToObject)).toBe('researcher');
  });
  it('maps an object panel target to its entity id', () => {
    expect(selectedEntityId({ kind: 'object', panelTarget: 'infra-status' }, targetToObject)).toBe('server-rack');
  });
  it('selects nothing for exit / none / unknown', () => {
    expect(selectedEntityId({ kind: 'exit' }, targetToObject)).toBeNull();
    expect(selectedEntityId({ kind: 'none' }, targetToObject)).toBeNull();
    expect(selectedEntityId({ kind: 'unknown', key: 'x' }, targetToObject)).toBeNull();
  });
});
