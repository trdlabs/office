import type { OfficeSceneConfig } from '@trading-office/office-visual-kit';
import {
  createTradingLabResearchFloorScene,
  type FloorThemeName,
} from '@trading-office/trading-lab-floor';

export const FLOOR_BASE_PATH = '/floor/trading-lab';

export function buildFloorConfig(theme: FloorThemeName): OfficeSceneConfig {
  return createTradingLabResearchFloorScene(theme);
}

/** Map panelTarget → object entity id, derived from the floor config objects. */
export function panelTargetToObjectId(config: OfficeSceneConfig): Record<string, string> {
  const map: Record<string, string> = {};
  for (const obj of config.objects) {
    if (obj.panelTarget) map[obj.panelTarget] = obj.id;
  }
  return map;
}
