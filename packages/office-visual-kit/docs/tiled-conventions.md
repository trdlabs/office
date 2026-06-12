# Tiled Conventions

Floors are authored as [Tiled](https://www.mapeditor.org/) maps and exported
as JSON (`.tmj`). This document is the contract between the map author and the
renderer.

## Export settings

- Orientation: **orthogonal**, fixed size (no infinite maps).
- Tile layer format: **CSV** (or base64 *uncompressed*). Compression is not
  supported and fails loudly.
- Tilesets: **embedded in the map** ("Embed tilesets" on export). External
  `.tsx` references are rejected with a clear error.
- Tileset image paths are resolved **relative to the map URL** at load time.

## Required tile layers

| Layer name | Content | Notes |
| --- | --- | --- |
| `floor` | floor, carpets, rugs | bottom-most |
| `walls` | wall caps, wall faces, windows, doors | above floor |
| `furniture` | desks, chairs, plants, shelves | above walls |
| `decor` | desk items, small overlays | above furniture |

Any tile layer is rendered generically in map order, so extra layers are fine;
the four canonical names keep floors consistent and are what the docs and
examples assume. Missing layers are skipped silently.

## Object layers

### `agent_spawn_points`

Point objects. One per agent.

| Field | Value |
| --- | --- |
| `name` | spawn id — referenced by `AgentSceneConfig.spawnPoint` (defaults to the agent's `id`) |
| class (`type`) | `agent_spawn` |
| position | the agent's **feet** (sprites are anchored 0.5/1.0) |

Custom properties (all optional, used as fallback when no scene-config entry
exists):

| Property | Type | Meaning |
| --- | --- | --- |
| `role` | string | agent role (`boss`, `researcher`, …) |
| `displayName` | string | full name for panels/debug |
| `label` | string | short label under the sprite |
| `status` | string | initial status |

### `interactive_objects`

Rectangle objects. One per interactive (or decorative) object.

| Field | Value |
| --- | --- |
| `name` | object id — referenced by `ObjectSceneConfig.mapObjectName` (defaults to the object's `id`) |
| class (`type`) | `interactive_object` |
| rect | hover/click area; sprite objects should match the sprite size |

Custom properties (fallbacks for auto-discovered objects):

| Property | Type | Meaning |
| --- | --- | --- |
| `objectType` | string | `wall_monitor`, `boss_console`, … |
| `label` | string | label shown on the object |
| `panelTarget` | string | future React panel id |
| `interactive` | bool | `false` → no hover/click |

### `labels` (optional)

Tiled **text objects**. Rendered as faint decorative floor text. The text
color and `pixelsize` can be set per object; otherwise the theme's
`floorLabelColor` and an 8px default apply. The example ships this layer
empty and sets `labels.floor: false` — big zone words on the floor read as
noise; prefer zoning through layout and furniture.

## Binding rules (map ⨯ scene config)

1. Each scene-config agent looks up the spawn point named
   `spawnPoint ?? id`. Missing spawn → warning, agent skipped.
2. Each scene-config object looks up the rectangle named
   `mapObjectName ?? id`. Missing rect → warning, object skipped.
3. Map objects **without** a config entry are auto-discovered using their
   custom properties (`role`, `objectType`, `label`, …). This lets you
   prototype a floor in Tiled alone before writing the config.
4. Config always wins over map properties when both exist.

## How to add an agent to a floor

1. In Tiled: add a point to `agent_spawn_points`, name it (e.g. `quant`),
   place it at the agent's feet.
2. In the scene config: add
   `{ id: 'quant', role: 'strategy_analyst', displayName: 'Quant' }`.
3. Make sure the role sprite (`agent:strategy_analyst`) is in `assets`.

## How to add an interactive object

1. In Tiled: draw a rectangle in `interactive_objects`, name it
   (e.g. `risk-board`), size it to the future sprite.
2. In the scene config: add
   `{ id: 'risk-board', type: 'hypothesis_board', label: 'Risk Board', sprite: 'prop:hypothesis_board', panelTarget: 'risk-panel' }`.
3. Objects without `sprite` become invisible hit-areas — use this to make
   tile-layer furniture (e.g. a desk) clickable.

## How to create a new floor

1. Create a map in Tiled: orthogonal, any square tile size — the renderer is
   tile-size agnostic (the example uses 20×17 tiles at 32×32; keep the floor
   small so the default "fit" camera lands above 1× zoom and everything
   reads large).
2. Add the four tile layers and paint the room with your tileset.
3. Add `agent_spawn_points`, `interactive_objects`, optional `labels`.
4. Export as `.tmj` with embedded tilesets, put it under `public/maps/`.
5. Write a scene config (see [scene-schema.md](./scene-schema.md)).
6. Point `<OfficeSceneCanvas config={...}>` at it. No renderer changes needed.

Layout conventions that made the example read as a real office:

- a 3-row top wall (cap + two face rows) with a centered 2×2 door and 2×2
  windows; wall boards/monitors as object sprites hung **symmetrically
  around the door**;
- **front-facing workstations**: a 2×1 desk block (`desk_<variant>_l/r`,
  laptop lid back toward the viewer) with the agent's spawn point exactly
  on the block's **top edge** — the bust stays fully visible, the desk
  covers the lap; the nameplate chip is pushed onto the desk front via
  `theme.agentLabelOffsetY`; one empty tile row between stacked
  workstations; carpet zones (`crug_*` 9-slice) under desk wings separate
  them from the plank floor;
- big tile furniture (vending machine, water cooler) flanks the entrance
  with trash bins; bookshelves stand against walls;
- the Boss command console is painted as **furniture tiles** (`console_*`)
  with a sprite-less `interactive_objects` rect as its hit-area — that way
  the Boss's nameplate (entity layer) always draws above the desk; use the
  same trick for any clickable tile furniture;
- an **infra/server room** sits behind a glass partition (`glass_h`,
  `glass_door_l/r`, `glass_v`, `glass_corner` tiles in `furniture`) over a
  `floor_tech` floor; server rack / archive / bot-status live inside it as
  object sprites;
- plants in seams and corners; no random props in open floor.

The example floor's map is itself generated by a reviewable script
(`examples/trading-lab-research-floor/tools/generate-map.mjs`) — handy when
you want layouts in code review, but hand-authored Tiled maps are the primary
path.
