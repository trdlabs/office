import { PanelChrome } from './PanelChrome';
import type { OperatorEvidenceView } from './operatorTranscript';

const KIND_LABEL: Record<string, string> = {
  interpretation: 'Интерпретация',
  exact_duplicate: 'Точный дубликат',
  similar: 'Похожая стратегия',
  warning: 'Предупреждение',
};

export function OperatorEvidencePanel({ view, onClose }: { view: OperatorEvidenceView; onClose: () => void }) {
  return (
    <PanelChrome title="Доказательства" onClose={onClose}>
      <div className="evidence">
        <p className="evidence__summary">{view.text}</p>
        {view.badges.length === 0 ? (
          <p className="evidence__empty">Нет деталей.</p>
        ) : (
          <ul className="evidence__list">
            {view.badges.map((b, i) => (
              <li key={`${b.kind}:${b.sourceId ?? i}`} className="evidence__item" data-kind={b.kind}>
                <span className="evidence__kind">{KIND_LABEL[b.kind] ?? b.kind}</span>
                <span className="evidence__label">{b.label}</span>
                {b.sourceId && <code className="evidence__src">{b.sourceId}</code>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelChrome>
  );
}
