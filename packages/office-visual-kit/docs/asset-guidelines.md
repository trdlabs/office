# Asset Guidelines

This project may become public; every asset must be license-clean. Full
policy source: `docs/fable-input/02-asset-sources.md` and
`docs/fable-input/03-license-policy.md` in the repo root.

## Priority order

```text
1. Original / generated placeholder pixel assets   ← tiles, props, maps
2. Kenney CC0 environment/furniture assets         ← allowed, not yet used
3. LPC characters with attribution                 ← USED for the agents (Iteration 4)
4. Optional game-icons.net icons (CC-BY)           ← future path only
```

## 1. Generated assets (what the example uses)

Every PNG in `examples/trading-lab-research-floor/public/assets/generated/`
is produced by zero-dependency Node scripts in that example's `tools/`
directory:

| Script / module | Output |
| --- | --- |
| `tools/lib/tiles.mjs` | `tiles/office-tileset-day.png` + `-night.png` — environment/furniture tiles, 32×32 (incl. 2×1 monitor desk blocks, the 4×2 mahogany boss console, glass partition with square corners + sliding door, tech floor) |
| `tools/lib/props.mjs` | `props/*.png` — interactive objects, 2 animation frames |
| `tools/lib/palette.mjs` | the "Retro Pixel AI Research Tower" day palette + `nightify()` + `EMISSIVE` |

(Agent sprites are NOT generated — they are composed from real LPC layers,
see section 3.)

**Chunky-pixel rule:** all environment art is drawn on a logical 16-px grid
and upscaled ×2 (`upscale()` in `tools/lib/img.mjs`) onto the 32-px tiles —
one art pixel is 2×2 real pixels. Large shapes and readable silhouettes
beat micro-detail; screens carry a single glowing glyph, never a dense fake
dashboard (monitor backs carry a generic glowing mark — no real-world
logos). LPC characters are native 1-px LPC density by design.

**Front-facing workstation rule (Iteration 3/4):** agents face the viewer.
A character is a seated bust — face with eyes, hair style, outfit, chair
back peeking at the sides — whose bottom edge is the "desk cut": the sprite
ends where the desk begins (spawn point = desk block top edge), so the desk
+ monitor cover the lap. The monitor's screen faces the agent; the viewer
sees its aluminum back. A role must read through hair style/color, outfit
and accessories (glasses etc.). The Boss is suited (gold tie) in a winged
executive chair behind the deep mahogany console. Agents sit still — both
strip frames are identical, no idle bobbing.

All art is drawn once in the Day Office palette. The night tileset is derived
automatically: `nightify()` pushes every pixel toward a dark blue cast except
the `EMISSIVE` colors (screen accents, LEDs, lamp light), which keep glowing;
tiles that need true night art (windows) opt in with a `themed` draw
function. Adding a tile once therefore gives you both themes.

Regenerate with `npm run generate` (deterministic — committed PNGs reproduce
byte-for-byte). These assets are original work created for this repository
and are released under the repository license; treat them as CC0-equivalent
placeholders. They exist to be replaced by better art later without touching
the renderer: keep the file names and frame layout, or update the scene
config's `assets` entries.

Sprite-strip convention: horizontal strips, `frameCount` frames of
`frameWidth` px; agents are anchored at the feet (bottom-center), props at
their top-left rectangle in Tiled.

## 2. Kenney assets (allowed, currently unused)

[Kenney](https://kenney.nl/assets) packs are CC0 and safe for the core kit.
If you add any:

```text
examples/<floor>/public/assets/third-party/kenney/
  SOURCE.md      — pack name + URL + download date
  LICENSE.txt    — the CC0 notice from the pack
  <files>
```

Attribution is not required for CC0, but credit Kenney in `SOURCE.md` for
transparency.

## 3. LPC characters (USED for the agents since Iteration 4)

The agent sprites are composed from real
[Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)
layers by `tools/compose-lpc-agents.mjs` in the example: it loads each
layer's `sit.png` sheet, recolors it with the generator's own palette
ramps, composites the layers in the generator's zPos order on the
south-facing chair-sit frame, draws an original office chair behind the
figure, and crops the seated bust at the desk cut line. The composed PNGs
plus the licensing docs are committed under:

```text
examples/<floor>/public/assets/third-party/lpc/
  agent-<role>.png  — 2-frame strip (identical frames), feet/desk-edge anchor
  SOURCE.md         — generator repo + exact commit + reproduce steps
  ATTRIBUTIONS.md   — every source file's authors/licenses/URLs, regenerated
                      from the generator's CREDITS.csv by the composer
  LICENSES.md       — the sprites are CC-BY-SA 3.0 (chosen from the
                      upstream multi-license); links to all license texts
```

LPC assets carry CC-BY-SA / OGA-BY / GPL licenses and **require attribution
per author** — never label LPC-derived files as generated/CC0; if the
attribution chain is unclear, do not use the asset. The kit itself needs no
code changes (an LPC composite is just another sprite strip — register it
with the right `frameWidth`/`frameCount`).

Keep LPC assets out of the core kit so the default path stays CC0-clean —
they live in the example's `third-party/` tree only.

## Forbidden

- images from Google/Pinterest or YouTube screenshots;
- assets from AgentRoom / Pixel Agents or similar projects;
- any asset without a source URL and license note;
- copying layout/characters/palette/composition from reference screenshots
  (references are private mood boards only and are git-ignored).

## Checklist for adding any third-party asset

1. Source URL recorded in a `SOURCE.md` next to the files.
2. License file or note included.
3. Attribution file created if the license requires it.
4. Asset registered in the scene config with a stable key.
