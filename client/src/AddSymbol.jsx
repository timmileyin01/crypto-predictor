import { useState } from 'react'
import { symbolsApi } from './api'
import { Search, Plus, X, Loader } from 'lucide-react'

export default function AddSymbol({ onAdded, onClose }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding]     = useState(null)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

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
      const { data } = await symbolsApi.add(coin.symbol, coin.coinId, coin.name)
      setSuccess(`✅ ${coin.name} added successfully with historical data`)
      setResults([])
      setQuery('')
      onAdded(coin.symbol)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add symbol')
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="add-symbol-overlay" onClick={onClose}>
      <div className="add-symbol-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h3 className="modal-title">Add Crypto Symbol</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <p className="modal-subtitle">
          Search for any cryptocurrency on CoinGecko and add it to your dashboard.
        </p>

        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-input-wrap">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search e.g. Cardano, Avalanche, Polkadot..."
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

        {error   && <div className="modal-error">{error}</div>}
        {success && <div className="modal-success">{success}</div>}

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
                  disabled={adding === coin.coinId}
                >
                  {adding === coin.coinId
                    ? <Loader size={13} className="spin" />
                    : <Plus size={13} />}
                  {adding === coin.coinId ? 'Adding...' : 'Add'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}