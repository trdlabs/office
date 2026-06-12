import type {
  NormalizedObject,
  NormalizedTiledMap,
} from '../core/normalizeTiledMap';
import {
  TILED_LAYERS,
  type AgentEntity,
  type AgentRole,
  type AgentStatus,
  type FloorLabel,
  type ObjectEntity,
} from '../core/sceneTypes';
import type { OfficeSceneConfig } from './officeSceneSchema';

/**
 * Pure merge of map geometry and scene semantics:
 * - spawn points from the `agent_spawn_points` layer + `agents` config
 *   → AgentEntity[];
 * - rectangles from the `interactive_objects` layer + `objects` config
 *   → ObjectEntity[];
 * - text objects from the `labels` layer → FloorLabel[].
 *
 * Config entries win over map properties. Map objects without a config entry
 * are auto-discovered with defaults so a floor can be prototyped in Tiled
 * alone; config entries without a map object produce a warning and are
 * skipped (nothing can be placed without coordinates).
 */

export interface ResolvedSceneEntities {
  agents: AgentEntity[];
  objects: ObjectEntity[];
  floorLabels: FloorLabel[];
  warnings: string[];
}

function asString(value: string | number | boolean | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function resolveSceneEntities(
  map: NormalizedTiledMap,
  config: OfficeSceneConfig,
): ResolvedSceneEntities {
  const warnings: string[] = [];
  const agents: AgentEntity[] = [];
  const objects: ObjectEntity[] = [];
  const floorLabels: FloorLabel[] = [];

  const spawnLayer = map.objectLayers.find(
    (l) => l.name === TILED_LAYERS.agentSpawnPoints,
  );
  const objectLayer = map.objectLayers.find(
    (l) => l.name === TILED_LAYERS.interactiveObjects,
  );
  const labelLayer = map.objectLayers.find((l) => l.name === TILED_LAYERS.labels);

  if (!spawnLayer) {
    warnings.push(
      `Map has no "${TILED_LAYERS.agentSpawnPoints}" object layer — no agents will be placed from the map.`,
    );
  }
  if (!objectLayer) {
    warnings.push(
      `Map has no "${TILED_LAYERS.interactiveObjects}" object layer — no interactive objects will be placed from the map.`,
    );
  }

  // --- Agents -------------------------------------------------------------

  const spawnByName = new Map<string, NormalizedObject>();
  for (const obj of spawnLayer?.objects ?? []) {
    if (obj.name) spawnByName.set(obj.name, obj);
  }

  const usedSpawns = new Set<string>();
  for (const agentConfig of config.agents) {
    const spawnName = agentConfig.spawnPoint ?? agentConfig.id;
    const spawn = spawnByName.get(spawnName);
    if (!spawn) {
      warnings.push(
        `Agent "${agentConfig.id}": spawn point "${spawnName}" not found in the map — agent skipped.`,
      );
      continue;
    }
    usedSpawns.add(spawnName);
    agents.push({
      kind: 'agent',
      id: agentConfig.id,
      role: agentConfig.role,
      displayName: agentConfig.displayName,
      label: agentConfig.label ?? agentConfig.displayName,
      status: agentConfig.initialStatus ?? 'idle',
      position: { x: spawn.x, y: spawn.y },
      labelOffsetY: agentConfig.labelOffsetY,
      mapObjectName: spawnName,
      properties: { ...spawn.properties },
    });
  }

  // Auto-discover spawn points that have no config entry.
  for (const [name, spawn] of spawnByName) {
    if (usedSpawns.has(name)) continue;
    const role = (asString(spawn.properties['role']) ?? 'researcher') as AgentRole;
    agents.push({
      kind: 'agent',
      id: name,
      role,
      displayName: asString(spawn.properties['displayName']) ?? name,
      label: asString(spawn.properties['label']) ?? name,
      status: (asString(spawn.properties['status']) ?? 'idle') as AgentStatus,
      position: { x: spawn.x, y: spawn.y },
      mapObjectName: name,
      properties: { ...spawn.properties },
    });
  }

  // --- Interactive objects --------------------------------------------------

  const rectByName = new Map<string, NormalizedObject>();
  for (const obj of objectLayer?.objects ?? []) {
    if (obj.name) rectByName.set(obj.name, obj);
  }

  const usedRects = new Set<string>();
  for (const objectConfig of config.objects) {
    const rectName = objectConfig.mapObjectName ?? objectConfig.id;
    const rect = rectByName.get(rectName);
    if (!rect) {
      warnings.push(
        `Object "${objectConfig.id}": map object "${rectName}" not found — object skipped.`,
      );
      continue;
    }
    usedRects.add(rectName);
    objects.push({
      kind: 'object',
      id: objectConfig.id,
      type: objectConfig.type,
      label: objectConfig.label ?? objectConfig.id,
      position: { x: rect.x, y: rect.y },
      size: { width: rect.width, height: rect.height },
      panelTarget:
        objectConfig.panelTarget ?? asString(rect.properties['panelTarget']),
      interactive: objectConfig.interactive !== false,
      mapObjectName: rectName,
      properties: { ...rect.properties },
    });
  }

  // Auto-discover map objects that have no config entry.
  for (const [name, rect] of rectByName) {
    if (usedRects.has(name)) continue;
    objects.push({
      kind: 'object',
      id: name,
      type: asString(rect.properties['objectType']) ?? 'agent_desk',
      label: asString(rect.properties['label']) ?? name,
      position: { x: rect.x, y: rect.y },
      size: { width: rect.width, height: rect.height },
      panelTarget: asString(rect.properties['panelTarget']),
      interactive: rect.properties['interactive'] !== false,
      mapObjectName: name,
      properties: { ...rect.properties },
    });
  }

  // --- Floor labels ----------------------------------------------------------

  for (const obj of labelLayer?.objects ?? []) {
    const text = obj.text?.text ?? asString(obj.properties['text']);
    if (!text) continue;
    floorLabels.push({
      text,
      position: { x: obj.x, y: obj.y },
      size:
        obj.width > 0 && obj.height > 0
          ? { width: obj.width, height: obj.height }
          : undefined,
      color: obj.text?.color,
      fontSize: obj.text?.pixelsize,
    });
  }

  return { agents, objects, floorLabels, warnings };
}
