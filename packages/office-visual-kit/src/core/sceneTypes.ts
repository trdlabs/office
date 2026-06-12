import type { Container } from 'pixi.js';

/**
 * Shared vocabulary of the Office Visual Builder Kit.
 *
 * Everything here is renderer-agnostic data: entities resolved from a Tiled
 * map plus a scene config. Views (Pixi display objects) implement
 * `EntityView` on top of these entities.
 */

/** Known agent roles. The union is open: custom roles are allowed. */
export type AgentRole =
  | 'boss'
  | 'strategy_analyst'
  | 'researcher'
  | 'critic'
  | 'builder'
  | 'evaluator'
  | 'performance_monitor'
  | 'knowledge_curator'
  | (string & {});

export const AGENT_ROLES: readonly AgentRole[] = [
  'boss',
  'strategy_analyst',
  'researcher',
  'critic',
  'builder',
  'evaluator',
  'performance_monitor',
  'knowledge_curator',
];

/** Agent activity statuses rendered as badges. */
export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'running'
  | 'waiting'
  | 'reviewing'
  | 'backtesting'
  | 'success'
  | 'failed'
  | 'blocked';

export const AGENT_STATUSES: readonly AgentStatus[] = [
  'idle',
  'thinking',
  'running',
  'waiting',
  'reviewing',
  'backtesting',
  'success',
  'failed',
  'blocked',
];

/** Known interactive object types. Open union — floors may add their own. */
export type InteractiveObjectType =
  | 'boss_console'
  | 'agent_desk'
  | 'wall_monitor'
  | 'hypothesis_board'
  | 'bot_status_monitor'
  | 'archive_shelf'
  | 'server_rack'
  | 'data_table'
  | 'elevator'
  | 'door'
  | (string & {});

export interface ScenePoint {
  x: number;
  y: number;
}

export interface SceneSize {
  width: number;
  height: number;
}

/** Property bag coming from Tiled custom properties and scene config. */
export type EntityProperties = Record<string, string | number | boolean>;

export interface AgentEntity {
  kind: 'agent';
  id: string;
  role: AgentRole;
  displayName: string;
  /** Short label rendered under the sprite (e.g. "Analyst"). */
  label: string;
  status: AgentStatus;
  /** World position of the agent's feet (anchor 0.5/1.0). */
  position: ScenePoint;
  /** Per-agent override of `theme.agentLabelOffsetY` (deeper desks). */
  labelOffsetY?: number;
  /** Name of the Tiled spawn-point object this agent was bound to. */
  mapObjectName?: string;
  properties: EntityProperties;
}

export interface ObjectEntity {
  kind: 'object';
  id: string;
  type: InteractiveObjectType;
  label: string;
  /** World position of the object's top-left corner. */
  position: ScenePoint;
  size: SceneSize;
  /**
   * Name of the future React panel this object should open. Phase 0 only
   * carries the value through to events / debug overlays.
   */
  panelTarget?: string;
  interactive: boolean;
  mapObjectName?: string;
  properties: EntityProperties;
}

export type OfficeEntity = AgentEntity | ObjectEntity;

/** Decorative floor text resolved from the `labels` object layer. */
export interface FloorLabel {
  text: string;
  position: ScenePoint;
  size?: SceneSize;
  color?: string;
  /** From the Tiled text object's `pixelsize`. */
  fontSize?: number;
}

/** Events the scene emits towards the host application. */
export interface OfficeSceneEventMap {
  'agent:hover': (agent: AgentEntity) => void;
  'agent:hoverout': (agent: AgentEntity) => void;
  'agent:click': (agent: AgentEntity) => void;
  'agent:status': (agent: AgentEntity, previous: AgentStatus) => void;
  'object:hover': (object: ObjectEntity) => void;
  'object:hoverout': (object: ObjectEntity) => void;
  'object:click': (object: ObjectEntity) => void;
  /** Fired with `null` when the selection is cleared. */
  'entity:select': (entity: OfficeEntity | null) => void;
  'scene:ready': () => void;
}

/** A Pixi view bound to one entity. */
export interface EntityView {
  readonly entity: OfficeEntity;
  readonly container: Container;
  setHovered(hovered: boolean): void;
  setSelected(selected: boolean): void;
  destroy(): void;
}

/** Canonical Tiled layer names. See docs/tiled-conventions.md. */
export const TILED_LAYERS = {
  floor: 'floor',
  walls: 'walls',
  furniture: 'furniture',
  decor: 'decor',
  agentSpawnPoints: 'agent_spawn_points',
  interactiveObjects: 'interactive_objects',
  labels: 'labels',
} as const;

/** Canonical Tiled object classes (the `type`/`class` field of an object). */
export const TILED_OBJECT_CLASSES = {
  agentSpawn: 'agent_spawn',
  interactiveObject: 'interactive_object',
  label: 'label',
} as const;
