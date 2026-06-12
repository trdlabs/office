import {
  AnimatedSprite,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Ticker,
  type Texture,
} from 'pixi.js';
import type { OfficeSceneTheme } from '../builder/officeSceneSchema';
import type { AssetRegistry } from './assetRegistry';
import { createLabelChip, type LabelChip } from './labelChip';
import type { StatusBadge, StatusBadgeRenderer } from './renderStatusBadges';
import type { AgentEntity, AgentStatus, EntityView } from './sceneTypes';

/**
 * Agent views: a status-driven pixel sprite anchored at the feet, a label
 * chip below, a status badge above and an animated hover/selection indicator
 * (a breathing rectangular highlight + corner-bracket reticle) framing the
 * character.
 *
 * Animation: when the sprite declares `states` (idle / active), the idle pose
 * is held while the agent is idle and the active loop (e.g. typing) plays
 * while it works — see `theme.agentIdleStatuses`.
 *
 * Interaction: only the character body is a hit target — the label chip and
 * the empty frame margins are not — so clicking the nameplate never selects.
 */

const DEFAULT_IDLE_STATUSES: readonly AgentStatus[] = ['idle'];

type AnimationStates = Record<string, { frames: Texture[]; speed: number }>;

export class AgentView implements EntityView {
  readonly container: Container;

  private readonly backing: Graphics;
  private readonly brackets: Graphics;
  private readonly badge: StatusBadge;
  private readonly labelChip: LabelChip | null;

  private readonly animation: AnimatedSprite | null;
  private readonly states: AnimationStates | null;
  private readonly idleStatuses: Set<AgentStatus>;
  private readonly speedJitter: number;
  private currentState: string | null = null;

  private hovered = false;
  private selected = false;
  private readonly spriteHeight: number;
  private readonly spriteWidth: number;
  private readonly labelMode: 'always' | 'hover';

  // Character body box — the hit area. The selection visuals start lower
  // (fxTop) so the reticle/backing clear the status badge above the head.
  private readonly boxHalfW: number;
  private readonly boxTop: number;
  private readonly boxBottom: number;
  private readonly fxTop: number;

  private ticking = false;
  private pulse = 0;
  private readonly onTick = (ticker: Ticker): void => {
    this.pulse += ticker.deltaTime * 0.09;
    this.redrawFx();
  };

  constructor(
    readonly entity: AgentEntity,
    private readonly theme: OfficeSceneTheme,
    registry: AssetRegistry,
    badgeRenderer: StatusBadgeRenderer,
    options: { spriteKey: string; showLabel: boolean; labelMode?: 'always' | 'hover' },
  ) {
    this.labelMode = options.labelMode ?? 'always';
    this.idleStatuses = new Set(theme.agentIdleStatuses ?? DEFAULT_IDLE_STATUSES);
    this.speedJitter = 0.85 + Math.random() * 0.3;

    this.container = new Container();
    this.container.label = `agent:${entity.id}`;
    this.container.position.set(entity.position.x, entity.position.y);
    // Depth-sort agents and object sprites by their baseline.
    this.container.zIndex = entity.position.y;

    // Selection backing (a translucent rounded rectangle) sits BEHIND the
    // character; the matching corner reticle is added in front, below.
    this.backing = new Graphics();
    this.backing.eventMode = 'none';
    this.container.addChild(this.backing);

    // Sprite — animated state machine when the asset declares states.
    this.states = registry.getAnimationStates(options.spriteKey);
    let sprite: Sprite;
    if (this.states) {
      const initial = this.states.idle ?? Object.values(this.states)[0]!;
      const anim = new AnimatedSprite(initial.frames);
      this.animation = anim;
      sprite = anim;
    } else {
      const frames = registry.getFrames(options.spriteKey);
      if (frames.length > 1) {
        const anim = new AnimatedSprite(frames);
        anim.animationSpeed =
          registry.getAnimationSpeed(options.spriteKey) * this.speedJitter;
        anim.play();
        // Desynchronize idle loops between agents.
        anim.currentFrame = Math.floor(Math.random() * frames.length);
        sprite = anim;
      } else {
        sprite = new Sprite(frames[0]);
      }
      this.animation = null;
    }
    sprite.anchor.set(0.5, 1);
    sprite.roundPixels = true;
    this.spriteHeight = sprite.height;
    this.spriteWidth = sprite.width;
    this.container.addChild(sprite);

    // Character body box (excludes the empty frame margins, the badge above
    // and the label below).
    this.boxHalfW = Math.max(13, this.spriteWidth * 0.25);
    this.boxTop = -(this.spriteHeight - 6);
    this.boxBottom = -3;
    this.fxTop = -(this.spriteHeight - 12);
    this.container.hitArea = new Rectangle(
      -this.boxHalfW,
      this.boxTop,
      this.boxHalfW * 2,
      this.boxBottom - this.boxTop,
    );
    // Only the container (its hitArea) is interactive — not the children, so
    // the label chip and badge are never click targets.
    this.container.interactiveChildren = false;

    this.badge = badgeRenderer.create(entity.status);
    this.badge.container.position.set(
      0,
      -this.spriteHeight - 3 - (theme.statusBadgeOffsetY ?? 0),
    );
    this.container.addChild(this.badge.container);

    if (options.showLabel) {
      this.labelChip = createLabelChip(entity.label, theme.agentLabel);
      // agentLabelOffsetY pushes the chip down past the desk block on floors
      // where the agent sits behind its desk; entity.labelOffsetY overrides
      // per agent (e.g. a deeper boss desk).
      this.labelChip.container.position.set(
        0,
        3 + (entity.labelOffsetY ?? theme.agentLabelOffsetY ?? 0),
      );
      this.labelChip.container.visible = this.labelMode === 'always';
      this.container.addChild(this.labelChip.container);
    } else {
      this.labelChip = null;
    }

    // Selection reticle draws IN FRONT of the character.
    this.brackets = new Graphics();
    this.brackets.eventMode = 'none';
    this.container.addChild(this.brackets);

    this.applyStatusAnimation(entity.status);
  }

  setStatus(status: AgentStatus): void {
    this.entity.status = status;
    this.badge.setStatus(status);
    this.applyStatusAnimation(status);
  }

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.refresh();
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.refresh();
  }

  /** Switch the sprite's animation state from the agent's status. */
  private applyStatusAnimation(status: AgentStatus): void {
    if (!this.animation || !this.states) return;
    const name = this.idleStatuses.has(status) ? 'idle' : 'active';
    const state =
      this.states[name] ?? this.states.idle ?? Object.values(this.states)[0];
    if (!state || this.currentState === name) return;
    this.currentState = name;
    const anim = this.animation;
    anim.textures = state.frames;
    if (state.frames.length > 1 && state.speed > 0) {
      anim.animationSpeed = state.speed * this.speedJitter;
      anim.currentFrame = Math.floor(Math.random() * state.frames.length);
      anim.play();
    } else {
      anim.gotoAndStop(0);
    }
  }

  private refresh(): void {
    const active = this.hovered || this.selected;
    if (this.labelChip && this.labelMode === 'hover') {
      this.labelChip.container.visible = active;
    }
    if (active) {
      this.startTicking();
      this.redrawFx();
    } else {
      this.stopTicking();
      this.backing.clear();
      this.brackets.clear();
    }
  }

  /** A breathing rectangular highlight + corner-bracket reticle. */
  private redrawFx(): void {
    const color = this.selected ? this.theme.selectionColor : this.theme.hoverColor;
    const p = 0.5 + 0.5 * Math.sin(this.pulse);

    // Translucent rounded-rectangle backing behind the character.
    const pad = 2;
    const bg = this.backing;
    bg.clear();
    bg.roundRect(
      -this.boxHalfW - pad,
      this.fxTop - pad,
      this.boxHalfW * 2 + pad * 2,
      this.boxBottom - this.fxTop + pad * 2,
      4,
    ).fill({ color, alpha: (this.selected ? 0.3 : 0.18) + 0.1 * p });

    const b = this.brackets;
    b.clear();
    const expand = (this.selected ? 1.5 : 0.5) + 1.6 * p;
    const x1 = this.boxHalfW + expand;
    const y0 = this.fxTop - expand;
    const y1 = this.boxBottom + expand;
    const len = this.selected ? 6 : 4.5;
    const width = this.selected ? 1.6 : 1.1;
    const alpha = (this.selected ? 0.85 : 0.6) + 0.15 * p;
    const corners: Array<[number, number, number, number]> = [
      [-x1, y0, 1, 1],
      [x1, y0, -1, 1],
      [-x1, y1, 1, -1],
      [x1, y1, -1, -1],
    ];
    for (const [cx, cyc, sx, sy] of corners) {
      b.moveTo(cx, cyc + sy * len)
        .lineTo(cx, cyc)
        .lineTo(cx + sx * len, cyc)
        .stroke({ color, width, alpha });
    }
  }

  private startTicking(): void {
    if (this.ticking) return;
    this.ticking = true;
    Ticker.shared.add(this.onTick);
  }

  private stopTicking(): void {
    if (!this.ticking) return;
    this.ticking = false;
    Ticker.shared.remove(this.onTick);
  }

  destroy(): void {
    this.stopTicking();
    this.badge.destroy();
    this.container.destroy({ children: true });
  }
}

export function renderAgent(
  entity: AgentEntity,
  theme: OfficeSceneTheme,
  registry: AssetRegistry,
  badgeRenderer: StatusBadgeRenderer,
  options: { spriteKey: string; showLabel: boolean; labelMode?: 'always' | 'hover' },
): AgentView {
  return new AgentView(entity, theme, registry, badgeRenderer, options);
}
