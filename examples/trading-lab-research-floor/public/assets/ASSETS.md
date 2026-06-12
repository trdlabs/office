# Asset provenance

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
- The agent characters are LPC-*inspired* (proportion/variety ideas only)
  but are fully original pixels drawn by `tools/lib/agents.mjs` — no LPC
  spritesheets, parts, or palettes were used. Since Visual Iteration 3 they
  are **front-facing seated busts** (face, eyes, hair styles, outfits,
  glasses/cap/headset accessories; the Boss gets a winged executive chair),
  designed to sit behind the generated desks. Importing real LPC Generator
  output remains a supported future drop-in path: such files must live
  under `assets/third-party/lpc/` with `SOURCE.md` + `ATTRIBUTIONS.md` +
  `LICENSES.md` (CC-BY-SA/GPL attribution) and must never be labeled
  generated/CC0 (see `packages/office-visual-kit/docs/asset-guidelines.md`).

Third-party assets (none at the moment) must live under
`assets/third-party/<source>/` with `SOURCE.md` + license files — see
`packages/office-visual-kit/docs/asset-guidelines.md`.
