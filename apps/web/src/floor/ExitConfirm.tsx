import { useEffect } from 'react';

export function ExitConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal exit-confirm"
        role="dialog"
        aria-modal="true"
        aria-label="Leave floor"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Return to lobby?</h2>
        <p className="panel__state">You stay signed in — re-enter through the door anytime.</p>
        <div className="exit-confirm__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Stay</button>
          <button type="button" className="btn btn--primary" onClick={onConfirm}>Return to lobby</button>
        </div>
      </div>
    </div>
  );
}
