import type {
  AgentEntity,
  ObjectEntity,
  OfficeEntity,
  OfficeScene,
} from '@trading-office/office-visual-kit';
import { OfficeSceneCanvas } from '@trading-office/office-visual-kit/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OperatorEvidenceView } from './panels/operatorTranscript';
import { useNavigate } from 'react-router-dom';
import { type FloorThemeName } from '@trading-office/trading-lab-floor';
import { useRuntimeStore, useConnectionStatus } from '../runtime/RuntimeContext';
import { applyStatusToScene } from '../runtime/sceneBridge';
import { INITIAL_STATUSES } from '@trading-office/office-fixtures';
import { CityBackdrop } from '../city/CityBackdrop';
import { buildFloorConfig, panelTargetToObjectId } from './floorConfig';
import { selectionKey, type RouteSelection } from './floorSelection';
import {
  opensDock,
  resolvePanel,
  selectedEntityId,
  type FloorAgentInfo,
} from './panelRegistry';
import { PanelDock } from './PanelDock';
import { ExitConfirm } from './ExitConfirm';

const NONE = { kind: 'none' } as const;
const OPERATOR_CHAT = { kind: 'operator-chat' } as const;
const OPERATOR_EVIDENCE = { kind: 'operator-evidence' } as const;

export function FloorScreen({ themeName = 'day' }: { themeName?: FloorThemeName }) {
  const navigate = useNavigate();
  const store = useRuntimeStore();
  const connection = useConnectionStatus();
  const degraded = connection === 'reconnecting' || connection === 'disconnected' || connection === 'error';

  const config = useMemo(() => buildFloorConfig(themeName), [themeName]);
  const targetToObject = useMemo(() => panelTargetToObjectId(config), [config]);
  const agentInfos = useMemo<FloorAgentInfo[]>(
    () => config.agents.map((a) => ({ id: a.id, role: a.role })),
    [config],
  );

  const [scene, setScene] = useState<OfficeScene | null>(null);
  const reconciling = useRef(false);
  const [error, setError] = useState<Error | null>(null);
  const floorRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // Dock state is LOCAL UI state, independent of the route and of each other.
  const [leftSel, setLeftSel] = useState<RouteSelection | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [evidenceView, setEvidenceView] = useState<OperatorEvidenceView | null>(null);

  const leftKind = useMemo(
    () => (evidenceView ? OPERATOR_EVIDENCE : leftSel ? resolvePanel(leftSel, agentInfos) : NONE),
    [evidenceView, leftSel, agentInfos],
  );
  const leftOpen = opensDock(leftKind);
  const selKey = leftSel ? selectionKey(leftSel) : 'none';

  const closeLeft = useCallback(() => {
    if (evidenceView) { setEvidenceView(null); return; }
    setLeftSel(null);
  }, [evidenceView]);

  const onAgentClick = useCallback((agent: AgentEntity) => {
    if (reconciling.current) return;
    setLeftSel({ agentId: agent.id });
  }, []);
  const onObjectClick = useCallback((object: ObjectEntity) => {
    if (reconciling.current) return;
    if (!object.panelTarget) return;
    if (object.panelTarget === 'exit') {
      setExitOpen(true);
      return;
    }
    setLeftSel({ panelTarget: object.panelTarget });
  }, []);
  const onEntitySelect = useCallback((entity: OfficeEntity | null) => {
    if (reconciling.current) return;
    if (entity === null) setLeftSel(null);
  }, []);

  const handleSceneReady = useCallback((next: OfficeScene) => {
    setScene(next);
  }, []);

  useEffect(() => {
    if (!scene) return;
    return applyStatusToScene(scene, store);
  }, [scene, store]);

  useEffect(() => {
    if (!scene) return;
    const id = selectedEntityId(leftKind, targetToObject);
    reconciling.current = true;
    try {
      scene.selectEntity(id);
    } finally {
      reconciling.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, selKey]);

  useEffect(() => {
    store.setStatuses(INITIAL_STATUSES);
  }, [store]);

  // The docks fill the side gap exactly (screen edge → office edge), so they
  // stretch right up to the office. Measure that gap and expose it as a CSS var.
  useEffect(() => {
    const floor = floorRef.current;
    const frame = frameRef.current;
    if (!floor || !frame) return;
    const ROWS = 15; // office is 15 tile rows tall (640×480 world)
    const update = () => {
      // Snap the office height to a whole number of px per tile row so the
      // tilemap renders at an INTEGER tile size — a fractional fit scale bleeds
      // 1px seams between tiles. Costs ≤ a few px (clipped by overflow:hidden).
      const tilePx = Math.max(1, Math.round(floor.clientHeight / ROWS));
      frame.style.height = `${tilePx * ROWS}px`;
      // the side brick divider is half a tile wide (≈ 2× narrower than a full
      // scene wall column would be).
      floor.style.setProperty('--wall-w', `${Math.round(tilePx / 2)}px`);
      const gap = Math.max(0, (floor.clientWidth - frame.clientWidth) / 2);
      floor.style.setProperty('--side-gap', `${Math.round(gap)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(floor);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="floor" data-theme={themeName} ref={floorRef}>
      <CityBackdrop className="floor__backdrop" mood={themeName} />

      {/* office fills the viewport height (its own side-wall columns separate it
          from the city); the docks fill the side gaps */}
      <div className="floor__frame" ref={frameRef}>
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
      </div>

      {/* Left dock: agent logs / object inspection. Right dock: chat. Both can
          be open at once and stretch to the office edge. */}
      <PanelDock side="left" open={leftOpen} panelKind={leftKind} evidenceView={evidenceView} onClose={closeLeft} />
      <PanelDock side="right" open={chatOpen} panelKind={OPERATOR_CHAT} onClose={() => setChatOpen(false)} onShowEvidence={setEvidenceView} />

      {!chatOpen && (
        <button type="button" className="floor__chat-btn" onClick={() => setChatOpen(true)}>
          <svg className="floor__chat-icon" width="15" height="14" viewBox="0 0 10 9" shapeRendering="crispEdges" aria-hidden="true">
            <rect x="0" y="0" width="10" height="7" fill="currentColor" />
            <rect x="1" y="7" width="2" height="2" fill="currentColor" />
          </svg>
          Open chat
        </button>
      )}

      {degraded && (
        <div className="floor__conn-warning" role="alert">
          Connection {connection} — live data may be stale. (No fallback to mock.)
        </div>
      )}

      {exitOpen && (
        <ExitConfirm onConfirm={() => navigate('/')} onCancel={() => setExitOpen(false)} />
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
