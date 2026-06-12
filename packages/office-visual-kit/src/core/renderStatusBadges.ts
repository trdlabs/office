import { Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js';
import type { OfficeSceneTheme } from '../builder/officeSceneSchema';
import { DEFAULT_STATUS_COLORS } from '../builder/officeSceneSchema';
import type { AgentStatus } from './sceneTypes';

/**
 * Status badges: a small pill with a colored dot and the status text floating
 * above an agent's head. Idle statuses hide the badge entirely; busy statuses
 * append an ellipsis and the text gets a shimmer sweep (à la "Thinking…") so a
 * working agent reads as alive. Pure Pixi Graphics + Text — no assets.
 */

export interface StatusBadge {
  container: Container;
  setStatus(status: AgentStatus): void;
  destroy(): void;
}

const BADGE_FONT = '"Courier New", ui-monospace, Menlo, monospace';
/** Ticks for one full shimmer sweep (deltaTime-scaled ⇒ ~fps-independent). */
const SHIMMER_PERIOD = 80;

export class StatusBadgeRenderer {
  constructor(private readonly theme: OfficeSceneTheme) {}

  colorFor(status: AgentStatus): string {
    return (
      this.theme.statusColors?.[status] ??
      DEFAULT_STATUS_COLORS[status] ??
      '#8a93a8'
    );
  }

  create(initial: AgentStatus): StatusBadge {
    const renderer = this;
    const showText = this.theme.statusBadgeText !== false;
    const scale = this.theme.statusBadgeScale ?? 1;
    const idleStatuses = new Set<AgentStatus>(
      this.theme.agentIdleStatuses ?? ['idle'],
    );

    const container = new Container();
    container.label = 'status-badge';

    const background = new Graphics();
    const dot = new Graphics();
    container.addChild(background, dot);

    // Two stacked copies of the text: a dim base always visible, and a bright
    // "sheen" copy clipped to a band that sweeps across it — the shimmer.
    let baseText: Text | null = null;
    let sheenText: Text | null = null;
    let sheenMask: Graphics | null = null;
    if (showText) {
      const makeText = (fill: string) => {
        const t = new Text({
          text: '',
          style: new TextStyle({
            fontFamily: BADGE_FONT,
            fontSize: 6 * scale,
            fontWeight: '700',
            fill,
            letterSpacing: 0.5 * scale,
          }),
          resolution: 4,
        });
        t.roundPixels = true;
        return t;
      };
      baseText = makeText('#9aa4be');
      sheenText = makeText('#ffffff');
      sheenMask = new Graphics();
      sheenText.mask = sheenMask;
      container.addChild(baseText, sheenText, sheenMask);
    }

    let ticking = false;
    let phase = 0;

    function updateSheen(): void {
      if (!sheenMask || !sheenText) return;
      const w = Math.max(1, Math.ceil(sheenText.width));
      const band = Math.max(4 * scale, w * 0.4);
      const t = (phase % SHIMMER_PERIOD) / SHIMMER_PERIOD;
      const x = sheenText.x - band + t * (w + band * 2);
      sheenMask.clear();
      sheenMask
        .rect(x, sheenText.y - 2, band, sheenText.height + 4)
        .fill({ color: '#ffffff' });
    }

    const onTick = (ticker: Ticker): void => {
      phase += ticker.deltaTime;
      updateSheen();
    };

    function startShimmer(): void {
      if (ticking || !sheenMask) return;
      ticking = true;
      Ticker.shared.add(onTick);
    }
    function stopShimmer(): void {
      if (!ticking) return;
      ticking = false;
      Ticker.shared.remove(onTick);
    }

    function redraw(status: AgentStatus): void {
      // Idle agents show no badge at all.
      if (idleStatuses.has(status)) {
        container.visible = false;
        stopShimmer();
        return;
      }
      container.visible = true;

      const color = renderer.colorFor(status);
      const dotRadius = 2 * scale;
      const padX = 3 * scale;
      const height = 9 * scale;

      const label = showText ? `${status}…` : '';
      if (baseText && sheenText) {
        baseText.text = label;
        sheenText.text = label;
      }
      const textWidth = baseText ? Math.ceil(baseText.width) : 0;
      const width =
        padX + dotRadius * 2 + (showText ? 3 * scale + textWidth : 0) + padX;

      background.clear();
      background
        .roundRect(0, 0, width, height, 3 * scale)
        .fill({ color: '#10131f', alpha: 0.78 })
        .stroke({ color, width: 0.75, alpha: 0.65 });

      dot.clear();
      dot.circle(padX + dotRadius, height / 2, dotRadius).fill({ color });
      dot
        .circle(padX + dotRadius, height / 2, dotRadius + 1.25)
        .stroke({ color, width: 0.75, alpha: 0.35 });

      if (baseText && sheenText) {
        const tx = padX + dotRadius * 2 + 3 * scale;
        const ty = (height - baseText.height) / 2;
        baseText.position.set(tx, ty);
        sheenText.position.set(tx, ty);
        startShimmer();
        updateSheen();
      }

      container.pivot.set(width / 2, height);
    }

    redraw(initial);

    return {
      container,
      setStatus(status: AgentStatus): void {
        redraw(status);
      },
      destroy(): void {
        stopShimmer();
        container.destroy({ children: true });
      },
    };
  }
}
