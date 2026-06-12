import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { OfficeSceneThemeLabelStyle } from '../builder/officeSceneSchema';

/**
 * Small readable text chip used for agent/object labels: pixel-ish
 * monospace text over a translucent rounded background.
 */

export interface LabelChip {
  container: Container;
  setHighlighted(highlighted: boolean, color: string): void;
}

const LABEL_FONT =
  '"Press Start 2P", "Courier New", ui-monospace, Menlo, monospace';

export function createLabelChip(
  textValue: string,
  style: Partial<OfficeSceneThemeLabelStyle> | undefined,
): LabelChip {
  const fontSize = style?.fontSize ?? 7;
  const color = style?.color ?? '#d4dcf0';
  const backgroundColor = style?.backgroundColor ?? '#10131f';
  const backgroundAlpha = style?.backgroundAlpha ?? 0.65;
  const borderColor = style?.borderColor;
  const borderAlpha = style?.borderAlpha ?? 0.9;

  const container = new Container();
  container.label = `label:${textValue}`;

  const text = new Text({
    text: textValue,
    style: new TextStyle({
      fontFamily: LABEL_FONT,
      fontSize,
      fill: color,
      fontWeight: '700',
      letterSpacing: 0.5,
      // The pixel display font may not be loaded; a dark outline + a 1px
      // drop shadow keep the (fallback monospace) text heavy and legible.
      stroke: { color: '#0a0c14', width: Math.max(1, fontSize * 0.16) },
      dropShadow: {
        color: '#000000',
        alpha: 0.5,
        blur: 0,
        angle: Math.PI / 2,
        distance: 1,
      },
    }),
    resolution: 4,
  });
  text.roundPixels = true;

  const padX = 3;
  const padY = 1.5;
  const w = Math.ceil(text.width) + padX * 2;
  const h = Math.ceil(text.height) + padY * 2;

  const background = new Graphics();

  function paint(highlighted: boolean, highlightColor?: string): void {
    background.clear();
    background.roundRect(0, 0, w, h, 2).fill({
      color: backgroundColor,
      alpha: highlighted ? Math.min(1, backgroundAlpha + 0.25) : backgroundAlpha,
    });
    if (highlighted && highlightColor) {
      background.roundRect(0, 0, w, h, 2).stroke({
        color: highlightColor,
        width: 0.75,
        alpha: 0.9,
      });
    } else if (borderColor) {
      // Base border — the "desk nameplate" look.
      background.roundRect(0, 0, w, h, 2).stroke({
        color: borderColor,
        width: 0.75,
        alpha: borderAlpha,
      });
    }
  }

  paint(false);

  text.position.set(padX, padY);
  container.addChild(background, text);
  // Center the chip on its container origin.
  container.pivot.set(w / 2, 0);

  return {
    container,
    setHighlighted(highlighted: boolean, highlightColor: string): void {
      paint(highlighted, highlightColor);
    },
  };
}
