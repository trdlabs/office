import { useGateway } from '../../runtime/RuntimeContext';
import { fmtNum, fmtPct, fmtText } from './format';
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
          <div className="row"><strong>{fmtText(b.strategy)}</strong><span className="tag">{fmtText(b.symbol)} · {fmtText(b.period)}</span></div>
          <span className="panel__state">
            PnL {fmtPct(b.pnlPct)} · Sharpe {fmtNum(b.sharpe)} · Win {fmtPct(b.winRatePct)} · MaxDD {fmtPct(b.maxDrawdownPct)}
          </span>
        </div>
      ))}
    </PanelChrome>
  );
}
