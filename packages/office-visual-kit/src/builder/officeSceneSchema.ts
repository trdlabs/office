import type {
  AgentRole,
  AgentStatus,
  InteractiveObjectType,
} from '../core/sceneTypes';

/**
 * The semantic scene schema.
 *
 * Split of responsibilities (see docs/scene-schema.md):
 * - The Tiled map owns geometry: tiles, walls, furniture, positions of spawn
 *   points and interactive object rectangles.
 * - The scene config (this schema) owns semantics: which agent lives on which
 *   spawn point, roles, labels, sprites, panel targets, theme, camera.
 * - Runtime state (statuses, metrics, live data) will later come from the
 *   office gateway; Phase 0 only exposes `setAgentStatus()` on the scene.
 */

export interface OfficeSceneThemeLabelStyle {
  /** CSS color of label text. */
  color: string;
  /** CSS color of the chip behind the label. */
  backgroundColor: string;
  backgroundAlpha: number;
  fontSize: number;
  /**
   * Optional chip border ("desk nameplate" look). Hover/selection highlight
   * temporarily overrides it with the theme highlight color.
   */
  borderColor?: string;
  borderAlpha?: number;
}

export interface OfficeSceneTheme {
  name?: string;
  /** Canvas clear color behind the map. */
  backgroundColor: string;
  /** Color of a subtle full-scene tint overlay ("night light"). */
  ambientOverlayColor?: string;
  /** 0..1 — set to 0 to disable the ambient overlay. */
  ambientOverlayAlpha?: number;
  /** Highlight color for hovered entities. */
  hoverColor: string;
  /** Highlight color for the selected entity. */
  selectionColor: string;
  /** Color of decorative floor labels from the `labels` Tiled layer. */
  floorLabelColor: string;
  statusColors?: Partial<Record<AgentStatus, string>>;
  /** Render short status text next to the badge dot. */
  statusBadgeText?: boolean;
  /**
   * World-space scale of status badges (default 1). Bump for floors with
   * larger tiles so badges keep their size relative to the scene.
   */
  statusBadgeScale?: number;
  /**
   * Extra world-space pixels between the agent sprite top and its status
   * badge (default 0). Raise it on floors where the desk/monitor sits above
   * the agent so badges float clear of the workstation.
   */
  statusBadgeOffsetY?: number;
  /**
   * Extra world-space pixels between the agent's feet anchor and its label
   * chip (default 0). On floors where the agent sits BEHIND its desk
   * (front-facing workstations), set this to the desk-block height so the
   * chip reads as a nameplate on the desk's front edge.
   */
  agentLabelOffsetY?: number;
  /**
   * Agent statuses that play the sprite's `idle` animation state; every
   * other status plays `active` (e.g. a typing loop). Only applies when the
   * agent's sprite declares animation `states`. Defaults to `['idle']`.
   */
  agentIdleStatuses?: AgentStatus[];
  agentLabel?: Partial<OfficeSceneThemeLabelStyle>;
  objectLabel?: Partial<OfficeSceneThemeLabelStyle>;
}

/**
 * A named slice of a sprite strip used for status-driven animation, e.g. an
 * agent that holds a still `idle` pose but plays a `typing` loop while busy.
 */
export interface SpriteAnimationState {
  /** First frame index (0-based) of this state in the strip. */
  from: number;
  /** Number of frames in the state; defaults to 1 (a single still frame). */
  count?: number;
  /** PIXI.AnimatedSprite speed for this state; 0 / one frame ⇒ held still. */
  speed?: number;
}

/**
 * One loadable sprite (or sprite strip) in the asset registry.
 * Strips are horizontal: `frameCount` frames of `frameWidth` px each.
 */
export interface SpriteAssetConfig {
  key: string;
  url: string;
  /** Defaults to image width / frameCount. */
  frameWidth?: number;
  /** Defaults to 1 (static sprite). */
  frameCount?: number;
  /** PIXI.AnimatedSprite speed; sensible idle default applied if omitted. */
  animationSpeed?: number;
  /**
   * Named frame ranges for status-driven animation. Agents look for an
   * `idle` state and an `active` state: the idle pose is held while the
   * agent is idle, the active loop plays while it works (see
   * `theme.agentIdleStatuses`). Omit for a plain static / looping sprite.
   */
  states?: Record<string, SpriteAnimationState>;
}

export interface AgentSceneConfig {
  id: string;
  role: AgentRole;
  displayName: string;
  /** Short label under the sprite; defaults to displayName. */
  label?: string;
  /** Name of the spawn-point object in Tiled; defaults to `id`. */
  spawnPoint?: string;
  initialStatus?: AgentStatus;
  /** Asset key override; defaults to `agent:<role>`. */
  sprite?: string;
  showLabel?: boolean;
  /**
   * Per-agent override of `theme.agentLabelOffsetY` — e.g. an agent behind
   * a deeper desk (the boss console) needs its nameplate pushed further
   * down to land on the desk's front face.
   */
  labelOffsetY?: number;
}

export interface ObjectSceneConfig {
  id: string;
  type: InteractiveObjectType;
  /** Human label; defaults to `id`. */
  label?: string;
  /** Name of the rectangle object in Tiled; defaults to `id`. */
  mapObjectName?: string;
  /** Future React panel identifier, carried through to events. */
  panelTarget?: string;
  /**
   * Asset key of the object sprite. When omitted the object becomes an
   * invisible hit-area over furniture painted in tile layers.
   */
  sprite?: string;
  /** Set false for purely decorative sprites (no hover/click). */
  interactive?: boolean;
  showLabel?: boolean;
}

export interface SceneCameraConfig {
  /** 'fit' (default) frames the whole floor; a number is a fixed zoom. */
  defaultZoom?: number | 'fit';
  /** Screen-space padding used by fit, px. */
  fitPadding?: number;
  minZoom?: number;
  maxZoom?: number;
  enablePan?: boolean;
  enableZoom?: boolean;
}

export interface OfficeSceneConfig {
  id: string;
  title: string;
  map: {
    /** URL of the Tiled JSON map (.tmj). */
    url: string;
  };
  theme?: Partial<OfficeSceneTheme>;
  assets: SpriteAssetConfig[];
  agents: AgentSceneConfig[];
  objects: ObjectSceneConfig[];
  camera?: SceneCameraConfig;
  labels?: {
    /** Show labels under agents (default true). */
    agents?: boolean;
    /** Show labels on interactive objects (default true). */
    objects?: boolean;
    /** Show decorative floor labels from the map (default true). */
    floor?: boolean;
    /**
     * 'always' (default) keeps agent label chips visible; 'hover' shows a
     * chip only while its agent is hovered or selected.
     */
    agentMode?: 'always' | 'hover';
    /** Same as `agentMode`, for interactive object labels. */
    objectMode?: 'always' | 'hover';
  };
}

export const DEFAULT_STATUS_COLORS: Record<AgentStatus, string> = {
  idle: '#8a93a8',
  thinking: '#a06bff',
  running: '#59f7d4',
  waiting: '#5a78b8',
  reviewing: '#ffb454',
  backtesting: '#4f9cff',
  success: '#69e85e',
  failed: '#ff5d5d',
  blocked: '#ff8a3d',
};

export const DEFAULT_THEME: OfficeSceneTheme = {
  name: 'retro-pixel-research-tower-night',
  backgroundColor: '#0b0e1a',
  ambientOverlayColor: '#2b2350',
  ambientOverlayAlpha: 0.08,
  hoverColor: '#7ef7ff',
  selectionColor: '#ffd166',
  floorLabelColor: '#54648c',
  statusColors: DEFAULT_STATUS_COLORS,
  statusBadgeText: true,
  agentLabel: {
    color: '#d4dcf0',
    backgroundColor: '#10131f',
    backgroundAlpha: 0.65,
    fontSize: 7,
  },
  objectLabel: {
    color: '#9fb2d8',
    backgroundColor: '#10131f',
    backgroundAlpha: 0.65,
    fontSize: 7,
  },
};

/** Merge a partial theme over the default theme. */
export function resolveTheme(theme?: Partial<OfficeSceneTheme>): OfficeSceneTheme {
  return {
    ...DEFAULT_THEME,
    ...theme,
    statusColors: { ...DEFAULT_STATUS_COLORS, ...theme?.statusColors },
    agentLabel: { ...DEFAULT_THEME.agentLabel, ...theme?.agentLabel },
    objectLabel: { ...DEFAULT_THEME.objectLabel, ...theme?.objectLabel },
  };
}
