import { useGateway } from '../../runtime/RuntimeContext';
import { PanelChrome, PanelState } from './PanelChrome';
import { useResource } from './useResource';

export function BacktestPanel({ onClose }: { onClose: () => void }) {
  const gateway = useGateway();
  const res = useResource(() => gateway.getBacktests(), []);
  return (
    <PanelChrome title="Backtests" onClose={onClose}>
      <PanelState resource={res} />
      {res.data?.map((b) => (
        <div key={b.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="row"><strong>{b.strategy}</strong><span className="tag">{b.symbol} · {b.period}</span></div>
          <span className="panel__state">
            PnL {b.pnlPct}% · Sharpe {b.sharpe} · Win {b.winRatePct}% · MaxDD {b.maxDrawdownPct}%
          </span>
        </div>
      ))}
    </PanelChrome>
  );
}
