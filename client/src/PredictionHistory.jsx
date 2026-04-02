import { useState, useEffect } from 'react'
import { cryptoApi } from './api'
import { TrendingUp, TrendingDown } from 'lucide-react'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT']

const fmt = (n) =>
  n >= 1000
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n?.toFixed(4) ?? '—'

const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', {
  year: 'numeric', month: 'short', day: 'numeric'
})

export default function PredictionHistory({ allSymbols }) {
  const [symbol, setSymbol]   = useState('BTCUSDT')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadHistory() {
    setLoading(true)
    try {
      const { data } = await cryptoApi.getPredictionHistory(symbol)
      setHistory(data.data)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadHistory() }, [symbol])

  const withActuals = history.filter((h) => h.actual_close !== null)
  const mape = withActuals.length > 0
    ? (withActuals.reduce((acc, h) => {
        return acc + Math.abs((h.actual_close - h.predicted_close) / h.actual_close)
      }, 0) / withActuals.length * 100).toFixed(2)
    : null

  return (
    <div className="pred-history-page">
      {/* Header */}
      <div className="pred-history-header">
        <h2 className="pred-history-title">Prediction History</h2>
        <div className="symbol-tabs">
          {(allSymbols.length > 0 ? allSymbols : SYMBOLS).map((s) => (
            <button
              key={s}
              className={`sym-tab ${s === symbol ? 'active' : ''}`}
              onClick={() => setSymbol(s)}
            >
              {s.replace('USDT', '')}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="pred-history-stats">
        <div className="ph-stat">
          <div className="ph-stat-label">Total predictions</div>
          <div className="ph-stat-value">{history.length}</div>
        </div>
        <div className="ph-stat">
          <div className="ph-stat-label">Actuals available</div>
          <div className="ph-stat-value">{withActuals.length}</div>
        </div>
        <div className="ph-stat">
          <div className="ph-stat-label">MAPE score</div>
          <div className="ph-stat-value" style={{
            color: mape === null ? 'var(--text2)' :
              mape < 3 ? 'var(--green)' :
              mape < 7 ? 'var(--accent-light)' : 'var(--red)'
          }}>
            {mape !== null ? `${mape}%` : '—'}
          </div>
        </div>
        <div className="ph-stat">
          <div className="ph-stat-label">Accuracy rating</div>
          <div className="ph-stat-value" style={{
            color: mape === null ? 'var(--text2)' :
              mape < 3 ? 'var(--green)' :
              mape < 7 ? 'var(--accent-light)' : 'var(--red)'
          }}>
            {mape === null ? '—' :
              mape < 3 ? 'Excellent' :
              mape < 7 ? 'Good' :
              mape < 10 ? 'Fair' : 'Poor'}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="pred-history-table-wrap">
        {loading ? (
          <div className="chart-placeholder">Loading...</div>
        ) : history.length === 0 ? (
          <div className="chart-placeholder">No prediction history yet.</div>
        ) : (
          <table className="pred-history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Predicted</th>
                <th>Actual</th>
                <th>Difference</th>
                <th>% Error</th>
                <th>Accuracy</th>
                <th>Model</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row, i) => {
                const predicted = parseFloat(row.predicted_close)
                const actual = row.actual_close ? parseFloat(row.actual_close) : null
                const diff = actual !== null ? actual - predicted : null
                const pctError = actual !== null
                  ? Math.abs((actual - predicted) / actual * 100).toFixed(2)
                  : null
                const isUp = diff !== null ? diff >= 0 : null

                return (
                  <tr key={i} className={actual ? '' : 'pending-row'}>
                    <td>{fmtDate(row.predicted_for)}</td>
                    <td className="price-cell">${fmt(predicted)}</td>
                    <td className="price-cell">
                      {actual !== null ? `$${fmt(actual)}` : <span className="pending-badge">Pending</span>}
                    </td>
                    <td>
                      {diff !== null ? (
                        <span className={diff >= 0 ? 'diff-up' : 'diff-down'}>
                          {diff >= 0 ? <TrendingUp size={11}/> : <TrendingDown size={11}/>}
                          {diff >= 0 ? '+' : ''}${fmt(Math.abs(diff))}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {pctError !== null ? (
                        <span style={{
                          color: pctError < 3 ? 'var(--green)' :
                            pctError < 7 ? 'var(--accent-light)' : 'var(--red)'
                        }}>
                          {pctError}%
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {pctError !== null ? (
                        <span className={`accuracy-badge-sm ${
                          pctError < 3 ? 'excellent' :
                          pctError < 7 ? 'good' :
                          pctError < 10 ? 'fair' : 'poor'
                        }`}>
                          {pctError < 3 ? 'Excellent' :
                           pctError < 7 ? 'Good' :
                           pctError < 10 ? 'Fair' : 'Poor'}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="model-cell">{row.model_version || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}