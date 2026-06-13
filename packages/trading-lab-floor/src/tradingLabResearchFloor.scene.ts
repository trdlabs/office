import type {
  OfficeSceneConfig,
  OfficeSceneTheme,
} from '@trading-office/office-visual-kit';

/**
 * Semantic scene config for the Trading Lab Research Floor.
 * Geometry (positions, sizes) lives in the Tiled map; this file binds map
 * objects to roles, sprites, labels and future panel targets.
 *
 * Two visual themes share one floor: 'day' (Day Office, the default) and
 * 'night' (Night Control Room). Each theme has its own generated tileset and
 * a .tmj with identical geometry, so switching themes never moves anything.
 */

export type FloorThemeName = 'day' | 'night';

export const FLOOR_THEMES: Record<
  FloorThemeName,
  { label: string; theme: Partial<OfficeSceneTheme> }
> = {
  day: {
    label: 'Day Office',
    theme: {
      name: 'day-office',
      backgroundColor: '#6f7886',
      ambientOverlayColor: '#ffd9a0',
      ambientOverlayAlpha: 0.04,
      hoverColor: '#0a84ff',
      selectionColor: '#e8590c',
      floorLabelColor: '#7a6850',
      statusBadgeScale: 1.1,
      // Drop the badge from floating high above the head to just over the
      // hair, close to the character.
      statusBadgeOffsetY: -8,
      // Push the agent chip below the desk block so it clears the desk and
      // reads as a floor nameplate in front of the workstation.
      agentLabelOffsetY: 30,
      agentLabel: {
        // Desk nameplate: dark plaque with a brass border.
        color: '#f2ead0',
        backgroundColor: '#33302c',
        backgroundAlpha: 0.96,
        borderColor: '#c9a23e',
        borderAlpha: 0.85,
        fontSize: 10,
      },
      objectLabel: {
        color: '#eef2f8',
        backgroundColor: '#2b3142',
        backgroundAlpha: 0.78,
        fontSize: 9,
      },
    },
  },
  night: {
    label: 'Night Control Room',
    theme: {
      name: 'night-control-room',
      backgroundColor: '#0b0e1a',
      ambientOverlayColor: '#2b2350',
      ambientOverlayAlpha: 0.16,
      hoverColor: '#7ef7ff',
      selectionColor: '#ffd166',
      floorLabelColor: '#54648c',
      statusBadgeScale: 1.1,
      statusBadgeOffsetY: -8,
      agentLabelOffsetY: 30,
      agentLabel: {
        color: '#d4dcf0',
        backgroundColor: '#10131f',
        backgroundAlpha: 0.92,
        borderColor: '#3e5a78',
        borderAlpha: 0.9,
        fontSize: 10,
      },
      objectLabel: {
        color: '#9fb2d8',
        backgroundColor: '#10131f',
        backgroundAlpha: 0.7,
        fontSize: 9,
      },
    },
  },
};

const AGENT_SPRITES = [
  'boss',
  'strategy_analyst',
  'researcher',
  'critic',
  'builder',
  'evaluator',
  'performance_monitor',
] as const;

const PROP_SPRITES: Array<{ key: string; file: string; frameWidth: number }> = [
  { key: 'prop:wall_monitor', file: 'wall-monitor', frameWidth: 96 },
  { key: 'prop:hypothesis_board', file: 'hypothesis-board', frameWidth: 96 },
  { key: 'prop:bot_status_monitor', file: 'bot-status-monitor', frameWidth: 48 },
  { key: 'prop:archive_shelf', file: 'archive-shelf', frameWidth: 64 },
  { key: 'prop:server_rack', file: 'server-rack', frameWidth: 56 },
];

export function createTradingLabResearchFloorScene(
  themeName: FloorThemeName = 'day',
): OfficeSceneConfig {
  return {
    id: `trading-lab-research-floor-${themeName}`,
    title: 'Trading Lab — Research Floor',
    map: { url: `/maps/trading-lab-research-floor-${themeName}.tmj` },

    theme: FLOOR_THEMES[themeName].theme,

    assets: [
      // Agents are composed from real Universal LPC Spritesheet Character
      // Generator layers (see public/assets/third-party/lpc/ for sources,
      // attributions and licenses). Each strip is a still idle pose (frame 0)
      // followed by a 3-frame typing loop (frames 1-3): the agent sits still
      // while idle and types at its keyboard while it works.
      ...AGENT_SPRITES.map((role) => ({
        key: `agent:${role}`,
        url: `/assets/third-party/lpc/agent-${role}.png`,
        frameWidth: 64,
        frameCount: 4,
        states: {
          idle: { from: 0, count: 1 },
          active: { from: 1, count: 3, speed: 0.14 },
        },
      })),
      ...PROP_SPRITES.map(({ key, file, frameWidth }) => ({
        key,
        url: `/assets/generated/props/${file}.png`,
        frameWidth,
        frameCount: 2,
        animationSpeed: 0.012,
      })),
    ],

    agents: [
      {
        id: 'boss',
        role: 'boss',
        displayName: 'Boss / Orchestrator',
        label: 'Boss',
        initialStatus: 'thinking',
        // The 4×2 mahogany console is deeper than a workstation desk: push
        // the nameplate below the console so the desk never overlaps it.
        labelOffsetY: 62,
      },
      {
        id: 'analyst',
        role: 'strategy_analyst',
        displayName: 'Strategy Analyst',
        label: 'Analyst',
        initialStatus: 'idle',
      },
      {
        id: 'researcher',
        role: 'researcher',
        displayName: 'Researcher',
        label: 'Researcher',
        initialStatus: 'thinking',
      },
      {
        id: 'critic',
        role: 'critic',
        displayName: 'Critic / Risk Reviewer',
        label: 'Critic',
        initialStatus: 'reviewing',
      },
      {
        id: 'builder',
        role: 'builder',
        displayName: 'Builder',
        label: 'Builder',
        initialStatus: 'running',
      },
      {
        id: 'evaluator',
        role: 'evaluator',
        displayName: 'Evaluator',
        label: 'Evaluator',
        initialStatus: 'backtesting',
      },
      {
        id: 'perf-monitor',
        role: 'performance_monitor',
        displayName: 'Performance Monitor',
        label: 'Monitor',
        initialStatus: 'idle',
      },
    ],

    objects: [
      {
        // The entrance door (painted in wall tiles) — a pure hit-area so it
        // can later trigger leaving the floor.
        id: 'door',
        type: 'door',
        label: 'Exit',
        panelTarget: 'exit',
      },
      {
        id: 'hypothesis-board',
        type: 'hypothesis_board',
        label: 'Hypothesis Board',
        panelTarget: 'hypothesis-pipeline',
        sprite: 'prop:hypothesis_board',
      },
      {
        id: 'wall-monitor',
        type: 'wall_monitor',
        label: 'Backtests',
        panelTarget: 'backtest-summary',
        sprite: 'prop:wall_monitor',
      },
      {
        id: 'bot-status',
        type: 'bot_status_monitor',
        label: 'Bot Status',
        panelTarget: 'bot-health',
        sprite: 'prop:bot_status_monitor',
      },
      {
        id: 'archive',
        type: 'archive_shelf',
        label: 'Archive',
        panelTarget: 'knowledge-base',
        sprite: 'prop:archive_shelf',
      },
      {
        id: 'server-rack',
        type: 'server_rack',
        label: 'Data Node',
        panelTarget: 'infra-status',
        sprite: 'prop:server_rack',
      },
    ],

    camera: {
      defaultZoom: 'fit',
      fitPadding: 16,
      minZoom: 0.5,
      maxZoom: 6,
    },

    labels: {
      agents: true,
      objects: true,
      // No decorative floor text in Iteration 2.
      floor: false,
      // Agent nameplates stay visible under the workstations; object labels
      // appear on hover so they never cover the furniture.
      agentMode: 'always',
      objectMode: 'hover',
    },
  };
}
