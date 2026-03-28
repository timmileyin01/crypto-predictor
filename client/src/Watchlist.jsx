import { useState, useEffect } from 'react'
import { watchlistApi, symbolsApi } from './api'
import { TrendingUp, TrendingDown, X, Plus } from 'lucide-react'

const fmt = (n) =>
  n >= 1000
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n?.toFixed(4) ?? '—'

export default function Watchlist({ onSelectSymbol }) {
  const [items, setItems]         = useState([])
  const [allSymbols, setAllSymbols] = useState([])
  const [loading, setLoading]     = useState(true)
  const [adding, setAdding]       = useState(false)
  const [error, setError]         = useState('')

  async function loadWatchlist() {
    setLoading(true)
    try {
      const { data } = await watchlistApi.getWithPredictions()
      setItems(data.data)
    } catch (err) {
      setError('Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }

  async function loadAllSymbols() {
    try {
      const { data } = await symbolsApi.getAll()
      setAllSymbols(data.data.map((s) => s.symbol))
    } catch { /* silent */ }
  }

  useEffect(() => {
    loadWatchlist()
    loadAllSymbols()
  }, [])

  async function handleAdd(symbol) {
    setAdding(true)
    setError('')
    try {
      await watchlistApi.add(symbol)
      await loadWatchlist()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add symbol')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(symbol) {
    try {
      await watchlistApi.remove(symbol)
      setItems((prev) => prev.filter((i) => i.symbol !== symbol))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove symbol')
    }
  }

  const watchedSymbols = items.map((i) => i.symbol)
  const unwatchedSymbols = allSymbols.filter((s) => !watchedSymbols.includes(s))

  return (
    <div className="watchlist">
      <div className="watchlist-header">
        <h3 className="watchlist-title">My Watchlist</h3>
      </div>

      {error && <div className="wl-error">{error}</div>}

      {loading ? (
        <div className="wl-empty">Loading...</div>
      ) : items.length === 0 ? (
        <div className="wl-empty">No symbols yet. Add one below.</div>
      ) : (
        <div className="wl-items">
          {items.map((item) => {
            const isUp = item.predicted_close >= item.last_close
            const diff = item.predicted_close - item.last_close
            const pct  = ((diff / item.last_close) * 100).toFixed(2)

            return (
              <div
                key={item.symbol}
                className="wl-item"
                onClick={() => onSelectSymbol(item.symbol)}
              >
                <div className="wl-item-left">
                  <span className="wl-symbol">
                    {item.symbol.replace('USDT', '')}
                  </span>
                  <span className="wl-last">
                    Last: ${fmt(parseFloat(item.last_close))}
                  </span>
                </div>
                <div className="wl-item-right">
                  <div className="wl-pred">
                    <span className={`wl-pred-price ${isUp ? 'up' : 'down'}`}>
                      ${fmt(parseFloat(item.predicted_close))}
                    </span>
                    <span className={`wl-pred-change ${isUp ? 'up' : 'down'}`}>
                      {isUp ? <TrendingUp size={11}/> : <TrendingDown size={11}/>}
                      {isUp ? '+' : ''}{pct}%
                    </span>
                  </div>
                  <button
                    className="wl-remove"
                    onClick={(e) => { e.stopPropagation(); handleRemove(item.symbol) }}
                    title="Remove from watchlist"
                  >
                    <X size={13}/>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {unwatchedSymbols.length > 0 && (
        <div className="wl-add">
          <div className="wl-add-label">Add to watchlist</div>
          <div className="wl-add-btns">
            {unwatchedSymbols.map((s) => (
              <button
                key={s}
                className="wl-add-btn"
                onClick={() => handleAdd(s)}
                disabled={adding}
              >
                <Plus size={12}/>
                {s.replace('USDT', '')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}