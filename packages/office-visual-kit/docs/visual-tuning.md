# Visual Tuning Guide

How to iterate on the look of a floor after visual feedback — without
touching the renderer.

## Move a desk / agent / object

Positions are geometry → they live in the map.

- **Generated example map**: edit
  `examples/trading-lab-research-floor/tools/generate-map.mjs` (desk
  coordinates, spawn points, object rects are plain numbers there), then
  `npm run generate:map`. Vite picks the new map up on reload.
- **Hand-authored map**: open the `.tmj` in Tiled, drag things, re-export.

Agents are anchored at the feet and face the viewer. A workstation is a
2×1 desk block (`desk_<variant>_l/r` tiles: desk surface + laptop with the
lid back toward the camera) plus a front-facing agent bust whose spawn
point sits **exactly on the desk block's top edge** — the desk and laptop
then cover the agent's lap and the scene reads as "agent works at a
computer" while the face, hair and outfit stay visible. The nameplate chip
is pushed down onto the desk's front edge via `theme.agentLabelOffsetY`
(set it to the desk-block height in px, minus a small overlap). Keep one
empty tile row between stacked workstations so plates and badges breathe.

## Change the palette

- **Environment/props/agents**: edit
  `examples/trading-lab-research-floor/tools/lib/palette.mjs` (one file owns
  every color), then `npm run generate:assets`. Draw in the day palette —
  the night tileset is derived by `nightify()`. Colors listed in `EMISSIVE`
  (screens, LEDs, lamp light) keep glowing at night.
- **UI accents (hover, selection, badges, labels, ambient)**: edit the
  `theme` block of the scene config — see `statusColors`, `hoverColor`,
  `selectionColor`, `ambientOverlayColor/Alpha`, `statusBadgeScale`.
- One bright accent per meaning: cyan = activity, amber = review/warning,
  red = failure, violet/gold = Boss.

## Switch / add a theme (Day Office ↔ Night Control Room)

The example ships two themes sharing one geometry. Each theme is:

1. a generated tileset image (`office-tileset-<theme>.png`);
2. a generated map (`trading-lab-research-floor-<theme>.tmj`) that differs
   only in tileset image and background color;
3. a `Partial<OfficeSceneTheme>` block in
   `src/scene/tradingLabResearchFloor.scene.ts` (`FLOOR_THEMES`).

The preview toggle simply swaps the scene config (`key` remounts the canvas).
To add a third theme: add an entry to `THEMES` in `tools/lib/tiles.mjs` with
its own post-process (or palette), add it to `THEME_COLORS` in
`generate-map.mjs`, add a `FLOOR_THEMES` entry, regenerate. No kit changes —
themes are entirely data.

## Labels that don't cover furniture

- `labels.agentMode` / `labels.objectMode` in the scene config: `'always'`
  (default) or `'hover'` — the example keeps agent nameplates always-on and
  shows object labels only on hover.
- Agent chips render below the feet anchor; `theme.agentLabelOffsetY`
  pushes them further down past the desk block so they read as a
  **nameplate on the desk's front edge** (the example uses `22` with 32px
  desk tiles). Style the plaque via `theme.agentLabel` — the example uses a
  dark plate, light text and a brass `borderColor` so plates never blend
  into the floor; font size lives in `agentLabel.fontSize` /
  `objectLabel.fontSize`.
- `theme.statusBadgeScale` scales the status pills;
  `theme.statusBadgeOffsetY` adds air between the sprite top and the badge —
  with front-facing agents nothing sits above their heads, so the example
  uses `2`. `statusBadgeText: false` switches badges to dot-only.
- Per-entity opt-out: `showLabel: false` on any agent/object entry.
- `labels.floor: false` (example default) — no decorative floor text; zones
  read through layout and furniture instead.

## Replace an asset with better art

1. Draw a PNG with the same frame layout (horizontal strip) — or change
   `frameWidth`/`frameCount` in the scene config's `assets` entry to match
   the new file.
2. Drop it under `public/assets/...` and point the asset `url` at it.
3. If it's third-party, follow
   [asset-guidelines.md](./asset-guidelines.md) (source + license files).

Nothing else changes — entity code references assets only by key.

## Add a new agent role

1. Add a style to `ROLE_STYLES` in `tools/lib/palette.mjs` (skin/hair/top/
   accent + `hairStyle`: `short`/`slick`/`long`/`ponytail`/`bun`/`curly` +
   `outfit`: `tee`/`hoodie`/`blazer`/`shirt_tie`/`turtleneck`/`vest`/`suit`
   + optional accessory: `glasses`, `cap`, `headset`; `executive: true`
   gives the tall winged command chair) and run `npm run generate:assets` —
   you get `agent-<role>.png` for free. Agents face the viewer:
   differentiate roles with hair, outfit and face-level accessories.
2. Register `{ key: 'agent:<role>', url: ... }` in the scene config assets.
3. Use the role in an `agents` entry. Custom role strings are allowed by the
   schema; nothing in the kit needs patching.

## Add a new interactive object type

1. Draw or generate a prop (add a draw function to `tools/lib/props.mjs` and
   it lands in `props/<name>.png` with 2 frames).
2. Register `{ key: 'prop:<type>', url: ... }` in assets.
3. Add a rect in the map's `interactive_objects` layer and an `objects` entry
   with your `type` string. Types are an open union — `panelTarget` is what
   the future app actually routes on.

## Scale / fit / camera feel

- `camera.fitPadding` — breathing room around the floor in the default view.
- `camera.defaultZoom: 2` — fixed integer zoom for the crispest pixels
  (non-integer fit zoom is slightly softer; both look fine with
  nearest-neighbour).
- `camera.minZoom/maxZoom` — how far users may stray.
- Readability rule of thumb from the brief: the whole floor should read at
  ~1280×720; labels and badges should stay legible at the default view.

## Density / noise control

- Fewer-but-larger props read better than many small ones; chunky 2× art
  pixels (draw at logical 16, `upscale()` ×2) beat micro-detail.
- The plank seams and floor grain live in `tools/lib/tiles.mjs`
  (`plankFloor`, the `floorSeam`/`plank` colors) — soften them there if the
  grid feels heavy at your target zoom.
- The command rug is a 9-slice zone (`rugZone()` in `generate-map.mjs`,
  `brug*` palette entries) — resize or recolor it instead of adding ad-hoc
  floor rectangles; keep rugs rare and intentional.
- Furniture follows office logic: cabinets/shelves against walls, break area
  (vending + coffee + cooler + trash) along a wall, infra grouped in one
  corner, plants in seams and corners — never random props in open floor.

## Iteration loop after visual feedback

```bash
npm run generate   # re-render assets + map after edits in tools/
npm run dev        # hot-reloads scene config and CSS edits live
```

Map and asset edits show up on the next browser reload; scene-config edits
hot-reload through Vite. Screenshots at 1280×720 are the canonical review
format.
