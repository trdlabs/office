import type {
  AgentEntity,
  ObjectEntity,
  OfficeEntity,
  OfficeScene,
} from '@trading-office/office-visual-kit';
import { OfficeSceneCanvas } from '@trading-office/office-visual-kit/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { type FloorThemeName } from '@trading-office/trading-lab-floor';
import { useGateway, useRuntimeStore } from '../runtime/RuntimeContext';
import { applyStatusToScene } from '../runtime/sceneBridge';
import { INITIAL_STATUSES } from '../runtime/fixtures';
import { buildFloorConfig, FLOOR_BASE_PATH, panelTargetToObjectId } from './floorConfig';
import { selectionKey, type RouteSelection } from './floorSelection';
import {
  opensDock,
  resolvePanel,
  selectedEntityId,
  type FloorAgentInfo,
} from './panelRegistry';
import { PanelDock } from './PanelDock';
import { ExitConfirm } from './ExitConfirm';

export function FloorScreen({
  themeName = 'day',
  simulate = false,
}: {
  themeName?: FloorThemeName;
  simulate?: boolean;
}) {
  const navigate = useNavigate();
  const store = useRuntimeStore();
  const gateway = useGateway();

  const config = useMemo(() => buildFloorConfig(themeName), [themeName]);
  const targetToObject = useMemo(() => panelTargetToObjectId(config), [config]);
  const agentInfos = useMemo<FloorAgentInfo[]>(
    () => config.agents.map((a) => ({ id: a.id, role: a.role })),
    [config],
  );

  const [scene, setScene] = useState<OfficeScene | null>(null);
  const reconciling = useRef(false);
  const [error, setError] = useState<Error | null>(null);

  // Route → selection
  const agentMatch = useMatch(`${FLOOR_BASE_PATH}/agent/:agentId`);
  const panelMatch = useMatch(`${FLOOR_BASE_PATH}/panel/:panelTarget`);
  const sel: RouteSelection = {
    agentId: agentMatch?.params.agentId,
    panelTarget: panelMatch?.params.panelTarget,
  };
  const panelKind = resolvePanel(sel, agentInfos);
  const selKey = selectionKey(sel);

  // Intent handlers — ONLY navigate; ignored while reconciling (echo guard).
  const onAgentClick = useCallback(
    (agent: AgentEntity) => {
      if (reconciling.current) return;
      navigate(`${FLOOR_BASE_PATH}/agent/${agent.id}`);
    },
    [navigate],
  );
  const onObjectClick = useCallback(
    (object: ObjectEntity) => {
      if (reconciling.current) return;
      if (!object.panelTarget) return;
      navigate(`${FLOOR_BASE_PATH}/panel/${object.panelTarget}`);
    },
    [navigate],
  );
  const onEntitySelect = useCallback(
    (entity: OfficeEntity | null) => {
      if (reconciling.current) return;
      if (entity === null) navigate(FLOOR_BASE_PATH);
    },
    [navigate],
  );

  // Theme switch remounts the canvas (key={themeName}) → a NEW OfficeScene.
  // Hold the scene in STATE (not a ref): updating it re-runs the bridge +
  // reconcile effects against the new instance and tears down the old ones.
  const handleSceneReady = useCallback((next: OfficeScene) => {
    setScene(next);
  }, []);

  // Bridge-seam: store → scene. Re-binds whenever the scene INSTANCE changes
  // (e.g. after a Day/Night remount); the cleanup unsubscribes the old scene.
  useEffect(() => {
    if (!scene) return;
    return applyStatusToScene(scene, store);
  }, [scene, store]);

  // Reconcile the scene to the route. Depends on the scene INSTANCE, so a
  // Day/Night remount re-applies the current route selection to the new scene.
  // The reconciling guard makes the kit's synchronous echo events
  // (agent:click/object:click/entity:select fired from selectEntity) no-ops,
  // so route → scene never loops back into navigate.
  useEffect(() => {
    if (!scene) return;
    const id = selectedEntityId(resolvePanel(sel, agentInfos), targetToObject);
    reconciling.current = true;
    try {
      scene.selectEntity(id);
      if (id) scene.focusEntity(id);
    } finally {
      reconciling.current = false;
    }
    // selKey captures sel; agentInfos/targetToObject are config-stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, selKey]);

  // Status simulation toggle (topbar). On → gateway pushes statuses into the
  // store (which the bridge-seam propagates to the scene + panels). Off → reset.
  useEffect(() => {
    if (!simulate) {
      store.setStatuses(INITIAL_STATUSES);
      return;
    }
    if (!gateway.subscribeAgentStatuses) return;
    const off = gateway.subscribeAgentStatuses((statuses) => store.setStatuses(statuses));
    return off;
  }, [simulate, gateway, store]);

  return (
    <div className="floor">
      <div className="floor__canvas">
        <OfficeSceneCanvas
          key={themeName}
          config={config}
          onSceneReady={handleSceneReady}
          onSceneError={setError}
          onAgentClick={onAgentClick}
          onObjectClick={onObjectClick}
          onEntitySelect={onEntitySelect}
        />
      </div>

      <PanelDock
        open={opensDock(panelKind)}
        panelKind={panelKind}
        onClose={() => navigate(FLOOR_BASE_PATH)}
      />

      {panelKind.kind === 'exit' && (
        <ExitConfirm
          onConfirm={() => navigate('/')}
          onCancel={() => navigate(FLOOR_BASE_PATH)}
        />
      )}

      {error && (
        <div className="scene-error">
          <strong>Scene failed to load</strong>
          <pre>{error.message}</pre>
        </div>
      )}
    </div>
  );
}
