import { Assets, Rectangle, Texture } from 'pixi.js';
import type { SpriteAssetConfig } from '../builder/officeSceneSchema';
import {
  findTilesetForGid,
  type NormalizedTileset,
} from './normalizeTiledMap';

/**
 * Loads and indexes every texture a scene needs:
 * - sprite assets declared in the scene config (`assets: [...]`), sliced into
 *   horizontal animation frames;
 * - tileset images referenced by the Tiled map, sliced into per-gid textures.
 *
 * All textures are forced to nearest-neighbour scaling for crisp pixel art.
 */

export interface SpriteAsset {
  config: SpriteAssetConfig;
  frames: Texture[];
}

/** Default idle animation speed (PIXI.AnimatedSprite units, frames/tick). */
export const DEFAULT_ANIMATION_SPEED = 0.022;

export class TilesetTextureIndex {
  private readonly entries: {
    tileset: NormalizedTileset;
    textures: (Texture | null)[];
  }[] = [];

  add(tileset: NormalizedTileset, textures: (Texture | null)[]): void {
    this.entries.push({ tileset, textures });
    this.entries.sort((a, b) => a.tileset.firstGid - b.tileset.firstGid);
  }

  /** @param gid Clean gid (flip bits already stripped). */
  textureForGid(gid: number): Texture | null {
    if (gid <= 0) return null;
    const tileset = findTilesetForGid(
      this.entries.map((e) => e.tileset),
      gid,
    );
    if (!tileset) return null;
    const entry = this.entries.find((e) => e.tileset === tileset);
    if (!entry) return null;
    return entry.textures[gid - tileset.firstGid] ?? null;
  }
}

function makePixelArt(texture: Texture): void {
  texture.source.scaleMode = 'nearest';
  texture.source.autoGenerateMipmaps = false;
}

async function loadBaseTexture(url: string): Promise<Texture> {
  const texture = await Assets.load<Texture>({
    src: url,
    data: { scaleMode: 'nearest' },
  });
  makePixelArt(texture);
  return texture;
}

export class AssetRegistry {
  private readonly sprites = new Map<string, SpriteAsset>();
  private readonly pending: SpriteAssetConfig[] = [];

  register(configs: SpriteAssetConfig[]): void {
    this.pending.push(...configs);
  }

  /** Load all registered sprite assets. Safe to call once after register(). */
  async load(): Promise<void> {
    const configs = this.pending.splice(0, this.pending.length);
    await Promise.all(
      configs.map(async (config) => {
        const base = await loadBaseTexture(config.url);
        const frameCount = Math.max(1, config.frameCount ?? 1);
        const frameWidth = config.frameWidth ?? Math.floor(base.width / frameCount);
        const frames: Texture[] = [];
        for (let i = 0; i < frameCount; i++) {
          const frame = new Texture({
            source: base.source,
            frame: new Rectangle(
              base.frame.x + i * frameWidth,
              base.frame.y,
              frameWidth,
              base.height,
            ),
          });
          makePixelArt(frame);
          frames.push(frame);
        }
        this.sprites.set(config.key, { config, frames });
      }),
    );
  }

  /** Slice every tileset image of a map into per-gid textures. */
  async loadTilesets(tilesets: NormalizedTileset[]): Promise<TilesetTextureIndex> {
    const index = new TilesetTextureIndex();
    await Promise.all(
      tilesets.map(async (tileset) => {
        const base = await loadBaseTexture(tileset.image);
        const columns =
          tileset.columns ||
          Math.max(1, Math.floor(tileset.imageWidth / tileset.tileWidth));
        const count =
          tileset.tileCount ||
          columns * Math.max(1, Math.floor(tileset.imageHeight / tileset.tileHeight));
        const textures: (Texture | null)[] = [];
        for (let i = 0; i < count; i++) {
          const col = i % columns;
          const row = Math.floor(i / columns);
          const x = tileset.margin + col * (tileset.tileWidth + tileset.spacing);
          const y = tileset.margin + row * (tileset.tileHeight + tileset.spacing);
          const texture = new Texture({
            source: base.source,
            frame: new Rectangle(x, y, tileset.tileWidth, tileset.tileHeight),
          });
          makePixelArt(texture);
          textures.push(texture);
        }
        index.add(tileset, textures);
      }),
    );
    return index;
  }

  has(key: string): boolean {
    return this.sprites.has(key);
  }

  getFrames(key: string): Texture[] {
    const asset = this.sprites.get(key);
    if (!asset) {
      throw new Error(`Asset "${key}" is not registered or not loaded.`);
    }
    return asset.frames;
  }

  getAnimationSpeed(key: string): number {
    return this.sprites.get(key)?.config.animationSpeed ?? DEFAULT_ANIMATION_SPEED;
  }

  /**
   * Resolve the named animation states declared on a sprite asset into ready
   * frame ranges. Returns null when the asset declares no `states`.
   */
  getAnimationStates(
    key: string,
  ): Record<string, { frames: Texture[]; speed: number }> | null {
    const asset = this.sprites.get(key);
    const states = asset?.config.states;
    if (!asset || !states) return null;
    const out: Record<string, { frames: Texture[]; speed: number }> = {};
    for (const [name, state] of Object.entries(states)) {
      const from = Math.max(0, state.from ?? 0);
      const count = Math.max(1, state.count ?? 1);
      const slice = asset.frames.slice(from, from + count);
      out[name] = {
        frames: slice.length > 0 ? slice : asset.frames.slice(0, 1),
        speed: state.speed ?? 0,
      };
    }
    return out;
  }

  destroy(): void {
    this.sprites.clear();
  }
}
