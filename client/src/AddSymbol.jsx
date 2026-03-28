import { useState, useEffect } from 'react'
import { symbolsApi } from './api'
import { Search, Plus, X, Loader, Trash2 } from 'lucide-react'

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']

export default function AddSymbol({ onAdded, onDeleted, onClose }) {
  const [tab, setTab]             = useState('add')
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding]       = useState(null)
  const [deleting, setDeleting]   = useState(null)
  const [symbols, setSymbols]     = useState([])
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  useEffect(() => {
    symbolsApi.getAll().then(({ data }) => {
      setSymbols(data.data.map((s) => s.symbol))
    }).catch(() => {})
  }, [])

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setError('')
    setResults([])
    try {
      const { data } = await symbolsApi.search(query.trim())
      if (data.data.length === 0) {
        setError('No coins found. Try a different search term.')
      } else {
        setResults(data.data)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  async function handleAdd(coin) {
    setAdding(coin.coinId)
    setError('')
    setSuccess('')
    try {
      await symbolsApi.add(coin.symbol, coin.coinId, coin.name)
      setSuccess(`✅ ${coin.name} added successfully`)
      setResults([])
      setQuery('')
      setSymbols((prev) => [...prev, coin.symbol])
      onAdded(coin.symbol)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add symbol')
    } finally {
      setAdding(null)
    }
  }

  async function handleDelete(symbol) {
    setDeleting(symbol)
    setError('')
    try {
      await symbolsApi.delete(symbol)
      setSymbols((prev) => prev.filter((s) => s !== symbol))
      setSuccess(`✅ ${symbol} deleted successfully`)
      onDeleted(symbol)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete symbol')
    } finally {
      setDeleting(null)
    }
  }

  const deletableSymbols = symbols.filter((s) => !DEFAULT_SYMBOLS.includes(s))

  return (
    <div className="add-symbol-overlay" onClick={onClose}>
      <div className="add-symbol-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Manage Symbols</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="auth-tabs" style={{ marginBottom: '16px' }}>
          <button
            type="button"
            className={`auth-tab ${tab === 'add' ? 'active' : ''}`}
            onClick={() => { setTab('add'); setError(''); setSuccess('') }}
          >
            Add Symbol
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === 'manage' ? 'active' : ''}`}
            onClick={() => { setTab('manage'); setError(''); setSuccess('') }}
          >
            Manage ({deletableSymbols.length})
          </button>
        </div>

        {error   && <div className="modal-error">{error}</div>}
        {success && <div className="modal-success">{success}</div>}

        {tab === 'add' && (
          <>
            <p className="modal-subtitle">
              Search for any cryptocurrency and add it to your dashboard.
            </p>
            <form className="search-form" onSubmit={handleSearch}>
              <div className="search-input-wrap">
                <Search size={15} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search e.g. Cardano, Avalanche..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={searching || !query.trim()}
              >
                {searching ? <Loader size={14} className="spin" /> : <Search size={14} />}
                {searching ? 'Searching...' : 'Search'}
              </button>
            </form>

            {results.length > 0 && (
              <div className="search-results">
                {results.map((coin) => (
                  <div key={coin.coinId} className="search-result-item">
                    <div className="result-left">
                      {coin.thumb && (
                        <img src={coin.thumb} alt={coin.name} className="coin-thumb" />
                      )}
                      <div>
                        <div className="result-name">{coin.name}</div>
                        <div className="result-symbol">{coin.symbol}</div>
                      </div>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleAdd(coin)}
                      disabled={adding === coin.coinId || symbols.includes(coin.symbol)}
                    >
                      {adding === coin.coinId
                        ? <Loader size={13} className="spin" />
                        : <Plus size={13} />}
                      {symbols.includes(coin.symbol) ? 'Added' : adding === coin.coinId ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'manage' && (
          <div className="manage-symbols">
            {deletableSymbols.length === 0 ? (
              <div className="wl-empty">
                No custom symbols added yet. Default symbols (BTC, ETH, SOL, BNB) cannot be deleted.
              </div>
            ) : (
              <div className="search-results">
                {deletableSymbols.map((symbol) => (
                  <div key={symbol} className="search-result-item">
                    <div className="result-left">
                      <div>
                        <div className="result-name">{symbol.replace('USDT', '')}</div>
                        <div className="result-symbol">{symbol}</div>
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary"
                      style={{ borderColor: '#f87171', color: '#f87171' }}
                      onClick={() => handleDelete(symbol)}
                      disabled={deleting === symbol}
                    >
                      {deleting === symbol
                        ? <Loader size={13} className="spin" />
                        : <Trash2 size={13} />}
                      {deleting === symbol ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '12px' }}>
              Default symbols (BTC, ETH, SOL, BNB) cannot be deleted.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}