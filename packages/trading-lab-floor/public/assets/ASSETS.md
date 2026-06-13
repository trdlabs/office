# Asset provenance

## `assets/generated/` — original, MIT/CC0-equivalent

Every file under `assets/generated/` is **original work created for this
repository** by the deterministic generator scripts in
`examples/trading-lab-research-floor/tools/` (run `npm run generate:assets`
to reproduce byte-for-byte).

- No third-party art, screenshots, or asset packs were used or traced.
- Reference screenshots (if any exist locally under
  `docs/fable-input/references/`) were private mood references only and are
  excluded from git; nothing was copied from them.
- License: these placeholders are released under the repository license
  (MIT, see `LICENSE` at the repo root) and may be treated as
  CC0-equivalent — use, modify, replace freely.
- Both theme tilesets (`office-tileset-day.png`, `office-tileset-night.png`)
  come from the same drawing pass: night is derived from the day art by
  `nightify()` in `tools/lib/palette.mjs`.

## `assets/third-party/lpc/` — real LPC assets, CC-BY-SA 3.0

Since Visual Iteration 4 the agent characters are **composed from real
Universal LPC Spritesheet Character Generator layers** (south-facing
chair-sit pose, recolored with the generator's own palette ramps, cropped
to a seated bust at the desk cut line) by
`tools/compose-lpc-agents.mjs`. They are **NOT** generated/original art and
are **NOT** MIT/CC0:

- `SOURCE.md` — upstream repo + exact commit + how to reproduce;
- `ATTRIBUTIONS.md` — per-source-file authors/licenses/URLs, regenerated
  from the generator's `CREDITS.csv` by the composer script;
- `LICENSES.md` — the sprites are distributed under **CC-BY-SA 3.0**
  (chosen from the upstream multi-license); keep the attributions with any
  redistribution.

The office-chair pixels drawn behind the LPC figures are original to this
repo (see `tools/compose-lpc-agents.mjs`) and ride along under the same
CC-BY-SA terms inside the composed PNGs.

Any other third-party assets must follow the same pattern:
`assets/third-party/<source>/` with `SOURCE.md` + license files — see
`packages/office-visual-kit/docs/asset-guidelines.md`.
