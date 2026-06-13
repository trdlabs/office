import type { OfficeScene } from '@trading-office/office-visual-kit';
import type { OfficeRuntimeStore } from './OfficeRuntimeStore';

/**
 * The embryo of the future RuntimeSceneBridge: subscribes the scene to the
 * store and pushes every status into scene.setAgentStatus. React panels never
 * touch the scene — this seam does. Returns an unsubscribe.
 */
export function applyStatusToScene(
  scene: OfficeScene,
  store: OfficeRuntimeStore,
): () => void {
  const sync = () => {
    const { statuses } = store.getSnapshot();
    for (const [id, status] of Object.entries(statuses)) {
      scene.setAgentStatus(id, status);
    }
  };
  sync();
  return store.subscribe(sync);
}
